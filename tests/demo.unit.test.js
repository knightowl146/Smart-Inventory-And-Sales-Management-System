const { isAllowedForDemo } = require("../middlewares/demoGuard");
const { responseFilter, maskEmail, maskPrivate } = require("../middlewares/responseFilter");
const { requireAuth } = require("../middlewares/auth");
const { requestContext } = require("../middlewares/requestContext");
const { signAccessToken } = require("../services/tokenService");
const User = require("../models/User");
const AiCall = require("../models/AiCall");
const { checkDemoAllowance, noteDemoCall, resetDemoAllowance } = require("../services/ai/demoAllowance");

/**
 * The public demo accounts, without a database.
 *
 * Their password is on the login page, so everything that keeps the shop's
 * data safe from them has to hold on the server. These pin down the three
 * parts: writes refused, other people's details masked, AI use capped.
 */

const request = (method, baseUrl, path) => ({ method, baseUrl, path });

describe("isAllowedForDemo", () => {
  it.each([
    ["GET", "/api/products", "/"],
    ["GET", "/api/users", "/"],
    ["HEAD", "/api/products", "/"],
    ["POST", "/api/ai", "/ask"],
    ["POST", "/api/ai", "/invoice/extract"],
    ["POST", "/api/ai", "/ask/"],
  ])("allows %s %s%s", (method, baseUrl, path) => {
    expect(isAllowedForDemo(request(method, baseUrl, path))).toBe(true);
  });

  it.each([
    ["POST", "/api/products", "/"],
    ["POST", "/api/products", "/abc/sell"],
    ["PUT", "/api/products", "/abc/purchase"],
    ["PATCH", "/api/users", "/abc"],
    ["DELETE", "/api/products", "/abc"],
    ["POST", "/api/users", "/abc/password"],
    ["POST", "/api/auth", "/logout-all"],
    ["POST", "/api/auth", "/change-password"],
    ["POST", "/api/ai", "/briefings"],
    // A write endpoint nobody has thought of yet is refused by default.
    ["POST", "/api/something-new", "/"],
  ])("refuses %s %s%s", (method, baseUrl, path) => {
    expect(isAllowedForDemo(request(method, baseUrl, path))).toBe(false);
  });
});

describe("requireAuth with a demo account", () => {
  const demo = { _id: "64b000000000000000000001", role: "owner", tokenVersion: 0 };

  const run = async (method, baseUrl, path) => {
    jest.spyOn(User, "findById").mockResolvedValue({
      ...demo,
      name: "Demo Owner",
      email: "demo@example.com",
      isActive: true,
      isDemo: true,
    });

    const token = signAccessToken(demo);
    const req = {
      method,
      baseUrl,
      path,
      get: (header) => (header.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined),
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const next = jest.fn();

    await requireAuth(req, res, next);
    return { req, res, next };
  };

  afterEach(() => jest.restoreAllMocks());

  it("lets a read through and marks the user as a demo", async () => {
    const { req, next } = await run("GET", "/api/products", "/");
    expect(next).toHaveBeenCalled();
    expect(req.user.isDemo).toBe(true);
  });

  it("stops a sale before it reaches any controller", async () => {
    const { res, next } = await run("POST", "/api/products", "/abc/sell");
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("DEMO_READ_ONLY");
  });
});

describe("masking for demo viewers", () => {
  it("keeps the first letter and the domain of an email", () => {
    expect(maskEmail("dakshita@gmail.com")).toBe("d•••••@gmail.com");
    expect(maskEmail("not-an-email")).toBe("•••••");
  });

  it("masks other people's emails, IPs and browsers at any depth, but not the viewer's own email", () => {
    const body = {
      data: [
        { name: "Real Owner", email: "owner@shop.com" },
        { name: "Demo", email: "Demo@Example.com" },
        { actor: { email: "staff@shop.com" }, ip: "203.0.113.9", userAgent: "Mozilla/5.0" },
      ],
    };

    const masked = maskPrivate(body, "demo@example.com", new WeakSet());

    expect(masked.data[0].email).toBe("o•••••@shop.com");
    expect(masked.data[1].email).toBe("Demo@Example.com");
    expect(masked.data[2].actor.email).toBe("s•••••@shop.com");
    expect(masked.data[2].ip).toBe("hidden in the demo");
    expect(masked.data[2].userAgent).toBe("hidden in the demo");
  });

  const filtered = (user, body) => {
    const req = { user };
    let sent;
    const res = { json: (value) => (sent = value) };
    responseFilter(req, res, () => {});
    res.json(body);
    return sent;
  };

  it("applies to demo accounts only - a real owner sees everything", () => {
    const body = () => ({ email: "staff@shop.com", purchasePrice: 40 });

    expect(filtered({ role: "owner", email: "o@shop.com" }, body())).toEqual(body());
    expect(filtered({ role: "owner", email: "d@example.com", isDemo: true }, body())).toEqual({
      email: "s•••••@shop.com",
      purchasePrice: 40,
    });
  });

  it("stacks with the employee cost filter for the demo employee", () => {
    const result = filtered(
      { role: "employee", email: "d@example.com", isDemo: true },
      { email: "staff@shop.com", purchasePrice: 40, name: "Cable" }
    );

    expect(result).toEqual({ email: "s•••••@shop.com", name: "Cable" });
  });
});

describe("the demo's AI allowance", () => {
  const demoReq = (ip = "203.0.113.5") => ({
    ip,
    user: { id: "64b000000000000000000002", isDemo: true },
  });

  // Runs the check the way the Gemini client does - inside a request.
  const inRequest = (req, fn) =>
    new Promise((resolve, reject) => {
      requestContext(req, {}, () => fn().then(resolve, reject));
    });

  const check = (spent = 0) =>
    checkDemoAllowance({ monthlySpend: async () => spent, monthlyBudget: 5 });

  beforeEach(() => {
    resetDemoAllowance();
    jest.spyOn(AiCall, "countDocuments").mockResolvedValue(0);
  });

  afterEach(() => jest.restoreAllMocks());

  it("never limits a real account", async () => {
    const real = { ip: "203.0.113.5", user: { id: "x", isDemo: false } };
    expect(await inRequest(real, () => check(100))).toBeNull();
  });

  it("allows a visitor 30 model calls a day, then says why it stopped", async () => {
    const req = demoReq();

    for (let i = 0; i < 30; i += 1) {
      expect(await inRequest(req, () => check())).toBeNull();
      await inRequest(req, async () => noteDemoCall());
    }

    expect(await inRequest(req, () => check())).toMatch(/30 AI requests per visitor/);
    // Someone else on the demo is unaffected.
    expect(await inRequest(demoReq("198.51.100.7"), () => check())).toBeNull();
  });

  it("stops the whole demo account at its daily total, counted from the database", async () => {
    AiCall.countDocuments.mockResolvedValue(150);
    expect(await inRequest(demoReq(), () => check())).toMatch(/used up by other visitors/);
  });

  it("keeps half the monthly budget for the real owner", async () => {
    expect(await inRequest(demoReq(), () => check(2.49))).toBeNull();
    expect(await inRequest(demoReq(), () => check(2.5))).toMatch(/share of this month's AI budget/);
  });
});
