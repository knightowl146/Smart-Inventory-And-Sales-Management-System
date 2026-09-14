const supertest = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");
const User = require("../models/User");
const { seedTestUsers, state, TEST_PASSWORD, anonymous } = require("./helpers/testClient");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Raw supertest here on purpose - these tests are about acquiring credentials,
// so they must not start with one already attached.
const raw = () => supertest(app);

const readRefreshCookie = (res) => {
  const cookies = res.headers["set-cookie"] || [];
  return cookies.find((cookie) => cookie.startsWith("sisms_rt="));
};

/**
 * A throwaway account for tests that end up revoking sessions.
 *
 * Reuse detection bumps tokenVersion, which by design kills every token that
 * account holds - including the long-lived owner token the rest of this file
 * (and testClient's `request`) authenticates with. Running those tests against
 * the shared owner is what makes the suite eat itself, so each gets its own
 * disposable user instead.
 */
const makeUser = async (email, role = "employee") => {
  const user = new User({ name: email, email, role });
  await user.setPassword(TEST_PASSWORD);
  await user.save();

  const login = await raw().post("/api/auth/login").send({ email, password: TEST_PASSWORD });

  return { user, login, cookie: readRefreshCookie(login), token: login.body.data.accessToken };
};

describe("POST /api/auth/login", () => {
  it("200: returns an access token and the user for correct credentials", async () => {
    const res = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(res.body.data.user.role).toBe("owner");
  });

  it("sets the refresh token as an httpOnly cookie scoped to /api/auth", async () => {
    const res = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });

    const cookie = readRefreshCookie(res);

    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("never returns the password hash or the session list", async () => {
    const res = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain("passwordHash");
    expect(serialised).not.toContain("$2");
    expect(res.body.data.user.sessions).toBeUndefined();
  });

  it("401: gives the same message for a wrong password and an unknown account", async () => {
    const wrongPassword = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: "not-the-password" });

    const unknownUser = await raw()
      .post("/api/auth/login")
      .send({ email: "nobody@test.local", password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
  });

  it("400: rejects a missing password", async () => {
    const res = await raw().post("/api/auth/login").send({ email: "owner@test.local" });
    expect(res.status).toBe(400);
  });

  it("403: refuses a deactivated account", async () => {
    const user = new User({
      name: "Deactivated",
      email: "gone@test.local",
      role: "employee",
      isActive: false,
    });
    await user.setPassword(TEST_PASSWORD);
    await user.save();

    const res = await raw()
      .post("/api/auth/login")
      .send({ email: "gone@test.local", password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/refresh", () => {
  it("200: exchanges the refresh cookie for a new access token", async () => {
    const login = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });

    const res = await raw()
      .post("/api/auth/refresh")
      .set("Cookie", readRefreshCookie(login));

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(readRefreshCookie(res)).toBeDefined();
  });

  it("rotates the refresh token, so the old one stops working", async () => {
    const { cookie: firstCookie } = await makeUser("rotate@test.local");

    const firstRefresh = await raw().post("/api/auth/refresh").set("Cookie", firstCookie);
    expect(firstRefresh.status).toBe(200);

    const replay = await raw().post("/api/auth/refresh").set("Cookie", firstCookie);
    expect(replay.status).toBe(401);
  });

  it("revokes every session when a rotated token is replayed", async () => {
    const { cookie: stolenCookie } = await makeUser("reuse@test.local");
    const rotated = await raw().post("/api/auth/refresh").set("Cookie", stolenCookie);
    const freshCookie = readRefreshCookie(rotated);

    // The attacker replays the token they captured before rotation...
    const replay = await raw().post("/api/auth/refresh").set("Cookie", stolenCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse/i);

    // ...which must also invalidate the legitimate user's current token.
    const victim = await raw().post("/api/auth/refresh").set("Cookie", freshCookie);
    expect(victim.status).toBe(401);
  });

  it("401: without a cookie", async () => {
    const res = await raw().post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("Access token lifecycle", () => {
  it("401: rejects a request with no Authorization header", async () => {
    const res = await anonymous(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("401: rejects a malformed token", async () => {
    const res = await raw().get("/api/products").set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });

  it("401: rejects a token whose tokenVersion is stale", async () => {
    const user = new User({ name: "Revoked", email: "revoked@test.local", role: "employee" });
    await user.setPassword(TEST_PASSWORD);
    await user.save();

    const login = await raw()
      .post("/api/auth/login")
      .send({ email: "revoked@test.local", password: TEST_PASSWORD });
    const token = login.body.data.accessToken;

    // Still valid right now.
    expect((await raw().get("/api/products").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    // The owner deactivates the account; the token must die immediately rather
    // than at its natural 15-minute expiry.
    await raw()
      .patch(`/api/users/${user._id}`)
      .set("Authorization", `Bearer ${state.ownerToken}`)
      .send({ isActive: false });

    const after = await raw().get("/api/products").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

describe("POST /api/auth/change-password", () => {
  it("200: changes the password and signs other devices out", async () => {
    const user = new User({ name: "Changer", email: "changer@test.local", role: "employee" });
    await user.setPassword(TEST_PASSWORD);
    await user.save();

    const deviceA = await raw()
      .post("/api/auth/login")
      .send({ email: "changer@test.local", password: TEST_PASSWORD });
    const deviceB = await raw()
      .post("/api/auth/login")
      .send({ email: "changer@test.local", password: TEST_PASSWORD });

    const res = await raw()
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${deviceA.body.data.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "a-brand-new-password" });

    expect(res.status).toBe(200);

    // The other device's access token is dead.
    const stale = await raw()
      .get("/api/products")
      .set("Authorization", `Bearer ${deviceB.body.data.accessToken}`);
    expect(stale.status).toBe(401);

    // The new password works, the old one does not.
    const oldPassword = await raw()
      .post("/api/auth/login")
      .send({ email: "changer@test.local", password: TEST_PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await raw()
      .post("/api/auth/login")
      .send({ email: "changer@test.local", password: "a-brand-new-password" });
    expect(newPassword.status).toBe(200);
  });

  it("400: rejects a new password below the minimum length", async () => {
    const res = await raw()
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${state.ownerToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "short" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("200: returns the signed-in user", async () => {
    const res = await raw().get("/api/auth/me").set("Authorization", `Bearer ${state.ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("owner@test.local");
  });

  it("401: without a token", async () => {
    const res = await raw().get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("200: clears the cookie and invalidates that session's refresh token", async () => {
    const login = await raw()
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });
    const cookie = readRefreshCookie(login);

    const res = await raw().post("/api/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(200);

    const afterLogout = await raw().post("/api/auth/refresh").set("Cookie", cookie);
    expect(afterLogout.status).toBe(401);
  });
});
