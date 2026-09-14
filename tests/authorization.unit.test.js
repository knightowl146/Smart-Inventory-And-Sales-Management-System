const express = require("express");
const supertest = require("supertest");

const { PERMISSIONS, can, roleHas } = require("../middlewares/permissions");
const { responseFilter, FINANCIAL_FIELDS } = require("../middlewares/responseFilter");
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("../services/tokenService");

/**
 * Database-free tests for the security-critical pure logic.
 *
 * The integration suites exercise the real routes against an in-memory MongoDB;
 * these cover the pieces that decide access and shape responses, so a mistake
 * in the permission table or the cost-field filter is caught in under a second
 * and without a database anywhere in the picture.
 */

// ── The permission table itself ──────────────────────────────────────────────

describe("Permission table", () => {
  it("gives the owner the wildcard", () => {
    expect(PERMISSIONS.owner).toEqual(["*"]);
    expect(roleHas("owner", "anything:at:all")).toBe(true);
  });

  it("denies the employee anything not explicitly listed", () => {
    const denied = [
      "product:create",
      "product:update",
      "product:delete",
      "product:purchase",
      "supplier:read",
      "analytics:read",
      "report:read",
      "user:read",
      "user:create",
      "audit:read",
      "finance:read",
      "movement:read", // the unscoped ledger; they hold movement:read:own instead
    ];

    for (const permission of denied) {
      expect(roleHas("employee", permission)).toBe(false);
    }
  });

  it("grants the employee exactly the shop-floor set", () => {
    expect(PERMISSIONS.employee).toEqual([
      "product:read",
      "product:sell",
      "customer:read",
      "customer:create",
      "movement:read:own",
      "me:read",
    ]);
  });

  it("denies an unknown role everything", () => {
    expect(roleHas("manager", "product:read")).toBe(false);
    expect(roleHas(undefined, "product:read")).toBe(false);
  });
});

// ── can() as an Express guard ────────────────────────────────────────────────

const guardApp = (permission, user) => {
  const app = express();
  app.use((req, res, next) => {
    if (user) req.user = user;
    next();
  });
  app.get("/thing", can(permission), (req, res) => res.json({ ok: true }));
  return app;
};

describe("can()", () => {
  it("401s when no user is attached, rather than falling through", async () => {
    const res = await supertest(guardApp("product:read", null)).get("/thing");
    expect(res.status).toBe(401);
  });

  it("403s a role without the permission", async () => {
    const app = guardApp("analytics:read", { role: "employee" });
    const res = await supertest(app).get("/thing");
    expect(res.status).toBe(403);
  });

  it("allows a role that holds the permission", async () => {
    const app = guardApp("product:read", { role: "employee" });
    const res = await supertest(app).get("/thing");
    expect(res.status).toBe(200);
  });

  it("treats an array as any-of", async () => {
    const app = guardApp(["movement:read", "movement:read:own"], { role: "employee" });
    const res = await supertest(app).get("/thing");
    expect(res.status).toBe(200);
  });
});

// ── Cost-field stripping ─────────────────────────────────────────────────────

const filterApp = (user, payload) => {
  const app = express();
  app.use((req, res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use(responseFilter);
  app.get("/thing", (req, res) => res.json(payload));
  return app;
};

const payload = () => ({
  success: true,
  data: [
    {
      name: "Widget",
      sku: "W-1",
      sellingPrice: 100,
      purchasePrice: 40,
      quantity: 5,
      stats: { profit: 300, margin: 0.6, unitsSold: 5 },
    },
  ],
  totals: { revenue: 500, totalCost: 200, grossProfit: 300 },
});

describe("responseFilter", () => {
  it("removes financial fields at every depth for an employee", async () => {
    const res = await supertest(filterApp({ role: "employee" }, payload())).get("/thing");
    const body = JSON.stringify(res.body);

    for (const field of FINANCIAL_FIELDS) {
      expect(body).not.toContain(field);
    }
  });

  it("keeps the fields an employee legitimately needs", async () => {
    const res = await supertest(filterApp({ role: "employee" }, payload())).get("/thing");

    expect(res.body.data[0].sellingPrice).toBe(100);
    expect(res.body.data[0].quantity).toBe(5);
    expect(res.body.data[0].stats.unitsSold).toBe(5);
  });

  it("leaves an owner's response completely untouched", async () => {
    const res = await supertest(filterApp({ role: "owner" }, payload())).get("/thing");

    expect(res.body.data[0].purchasePrice).toBe(40);
    expect(res.body.totals.grossProfit).toBe(300);
  });

  it("no-ops on an anonymous response", async () => {
    const res = await supertest(filterApp(null, { message: "Invalid email or password" })).get("/thing");
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("fails closed on a role that does not exist", async () => {
    const res = await supertest(filterApp({ role: "intern" }, payload())).get("/thing");
    expect(JSON.stringify(res.body)).not.toContain("purchasePrice");
  });
});

// ── Tokens ───────────────────────────────────────────────────────────────────

const fakeUser = (overrides = {}) => ({
  _id: { toString: () => "507f1f77bcf86cd799439011" },
  role: "owner",
  tokenVersion: 3,
  ...overrides,
});

describe("tokenService", () => {
  it("round-trips an access token with the subject, role and token version", () => {
    const payload = verifyAccessToken(signAccessToken(fakeUser()));

    expect(payload.sub).toBe("507f1f77bcf86cd799439011");
    expect(payload.role).toBe("owner");
    expect(payload.tv).toBe(3);
  });

  it("issues a unique jti and a future expiry for each refresh token", () => {
    const first = signRefreshToken(fakeUser());
    const second = signRefreshToken(fakeUser());

    expect(first.jti).not.toBe(second.jti);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(verifyRefreshToken(first.token).jti).toBe(first.jti);
  });

  it("refuses to verify a refresh token as an access token, and vice versa", () => {
    const access = signAccessToken(fakeUser());
    const { token: refresh } = signRefreshToken(fakeUser());

    // Different secrets AND a different audience claim - either alone would do.
    expect(() => verifyAccessToken(refresh)).toThrow();
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it("rejects a token signed with the wrong secret", () => {
    const jwt = require("jsonwebtoken");
    const forged = jwt.sign({ role: "owner", tv: 0 }, "attacker-secret", {
      subject: "507f1f77bcf86cd799439011",
      issuer: "smart-inventory-api",
      audience: "access",
    });

    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects the alg:none downgrade", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: "507f1f77bcf86cd799439011", role: "owner", tv: 0, aud: "access", iss: "smart-inventory-api" })
    ).toString("base64url");

    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrow();
  });
});
