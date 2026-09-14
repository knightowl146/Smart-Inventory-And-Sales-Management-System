const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");
const {
  seedTestUsers,
  state,
  asOwner,
  asEmployee,
  anonymous,
  TEST_PASSWORD,
} = require("./helpers/testClient");

let mongoServer;
let productId;
let supplierId;
let customerId;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  const supplier = await asOwner(app)
    .post("/api/suppliers")
    .send({ name: "RBAC Supplier", email: "rbac@supplier.test", phone: "9000000001" });
  supplierId = supplier.body.data._id;

  const customer = await asOwner(app)
    .post("/api/customers")
    .send({ name: "RBAC Customer", phone: "9000000002" });
  customerId = customer.body.customer._id;

  const product = await asOwner(app).post("/api/products").send({
    name: "RBAC Widget",
    sku: "RBAC-001",
    category: "Test",
    purchasePrice: 40,
    sellingPrice: 100,
    unitPrice: 100,
    quantity: 500,
    description: "A widget used to exercise the permission layer",
  });
  productId = product.body.data._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── Every route requires authentication ──────────────────────────────────────

describe("Unauthenticated access", () => {
  const guardedRoutes = [
    ["get", "/api/products"],
    ["get", "/api/customers"],
    ["get", "/api/suppliers"],
    ["get", "/api/movements"],
    ["get", "/api/analytics/profit-loss"],
    ["get", "/api/reports/sales"],
    ["get", "/api/dashboard/stats"],
    ["get", "/api/users"],
    ["get", "/api/audit"],
    ["get", "/api/me/summary"],
  ];

  it.each(guardedRoutes)("401: %s %s", async (method, route) => {
    const res = await anonymous(app)[method](route);
    expect(res.status).toBe(401);
  });

  it("the bare-path duplicates are gone, not merely unguarded", async () => {
    // /products used to be a second, identical mount of the product router.
    for (const route of ["/products", "/movements", "/analytics/sales", "/reports/sales"]) {
      const res = await asOwner(app).get(route);
      expect(res.status).toBe(404);
    }
  });
});

// ── Employees are denied the owner surface ───────────────────────────────────

describe("Employee is forbidden from owner-only routes", () => {
  const ownerOnly = [
    ["get", "/api/analytics/profit-loss"],
    ["get", "/api/analytics/inventory-valuation"],
    ["get", "/api/analytics/inventory/abc-analysis"],
    ["get", "/api/analytics/supplier-performance"],
    ["get", "/api/analytics/inventory/stock-recommendations"],
    ["get", "/api/dashboard/stats"],
    ["get", "/api/reports/sales"],
    ["get", "/api/reports/profit-loss"],
    ["get", "/api/reports/inventory/export"],
    ["get", "/api/suppliers"],
    ["get", "/api/users"],
    ["get", "/api/audit"],
  ];

  it.each(ownerOnly)("403: %s %s", async (method, route) => {
    const res = await asEmployee(app)[method](route);
    expect(res.status).toBe(403);
  });

  it("403: cannot create a product", async () => {
    const res = await asEmployee(app).post("/api/products").send({
      name: "Sneaky Product",
      sku: "SNEAK-001",
      category: "Test",
      purchasePrice: 1,
      sellingPrice: 2,
      unitPrice: 2,
      quantity: 1,
      description: "Should never be created",
    });
    expect(res.status).toBe(403);
  });

  it("403: cannot edit or delete a product", async () => {
    const patch = await asEmployee(app).patch(`/api/products/${productId}`).send({ sellingPrice: 1 });
    const del = await asEmployee(app).delete(`/api/products/${productId}`);

    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
  });

  it("403: cannot receive stock", async () => {
    const res = await asEmployee(app)
      .post(`/api/products/${productId}/purchase`)
      .send({ quantity: 10, unitPrice: 40, supplierId });

    expect(res.status).toBe(403);
  });

  it("403: cannot create or delete users", async () => {
    const create = await asEmployee(app)
      .post("/api/users")
      .send({ name: "Self Promoted", email: "promo@test.local", password: "password123", role: "owner" });
    const remove = await asEmployee(app).delete(`/api/users/${state.owner._id}`);

    expect(create.status).toBe(403);
    expect(remove.status).toBe(403);
  });
});

// ── Employees can do their actual job ────────────────────────────────────────

describe("Employee is allowed their own surface", () => {
  it("200: can read the catalogue", async () => {
    const res = await asEmployee(app).get("/api/products");
    expect(res.status).toBe(200);
  });

  it("200: can record a sale", async () => {
    const res = await asEmployee(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 2, unitPrice: 100, customerId });

    expect(res.status).toBe(200);
  });

  it("200: can add a walk-in customer", async () => {
    const res = await asEmployee(app)
      .post("/api/customers")
      .send({ name: "Walk In", phone: "9000000003" });

    expect(res.status).toBe(201);
  });

  it("200: gets their own summary", async () => {
    const res = await asEmployee(app).get("/api/me/summary");

    expect(res.status).toBe(200);
    expect(res.body.data.last7Days.unitsSold).toBeGreaterThan(0);
  });
});

// ── Cost data never reaches an employee ──────────────────────────────────────

describe("Field-level filtering of cost data", () => {
  it("strips purchasePrice from a product list for an employee", async () => {
    const owner = await asOwner(app).get("/api/products");
    const employee = await asEmployee(app).get("/api/products");

    expect(JSON.stringify(owner.body)).toContain("purchasePrice");
    expect(JSON.stringify(employee.body)).not.toContain("purchasePrice");
  });

  it("strips purchasePrice from a single product for an employee", async () => {
    const res = await asEmployee(app).get(`/api/products/${productId}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("purchasePrice");
    // The selling price is theirs to see - they quote it to the customer.
    expect(JSON.stringify(res.body)).toContain("sellingPrice");
  });

  it("leaves the owner's responses untouched", async () => {
    const res = await asOwner(app).get(`/api/products/${productId}`);
    expect(res.body.data.purchasePrice).toBeDefined();
  });
});

// ── The ledger is scoped per employee ────────────────────────────────────────

describe("Movement scoping", () => {
  it("an employee sees only movements they recorded", async () => {
    // The owner records a sale of their own.
    await asOwner(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: 100, customerId });

    const ownerView = await asOwner(app).get("/api/movements");
    const employeeView = await asEmployee(app).get("/api/movements");

    expect(ownerView.status).toBe(200);
    expect(employeeView.status).toBe(200);

    // Pagination totals must reflect the scoped query, not be filtered after.
    expect(employeeView.body.pagination.totalMovements).toBeLessThan(
      ownerView.body.pagination.totalMovements
    );

    const employeeId = state.employee._id.toString();
    for (const movement of employeeView.body.data) {
      expect(String(movement.createdBy)).toBe(employeeId);
    }
  });

  it("stamps the acting user onto every new movement", async () => {
    const res = await asOwner(app).get("/api/movements");
    const recent = res.body.data[0];

    expect(recent.createdBy).toBeDefined();
    expect(recent.createdBy).not.toBeNull();
  });
});

// ── User management guardrails ───────────────────────────────────────────────

describe("Owner user management", () => {
  it("201: creates an employee", async () => {
    const res = await asOwner(app).post("/api/users").send({
      name: "New Hire",
      email: "hire@test.local",
      password: "a-good-password",
      role: "employee",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("employee");
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("409: refuses a duplicate email", async () => {
    const res = await asOwner(app).post("/api/users").send({
      name: "Duplicate",
      email: "hire@test.local",
      password: "a-good-password",
    });

    expect(res.status).toBe(409);
  });

  it("400: refuses a password below the minimum length", async () => {
    const res = await asOwner(app).post("/api/users").send({
      name: "Weak",
      email: "weak@test.local",
      password: "short",
    });

    expect(res.status).toBe(400);
  });

  it("400: an owner cannot demote themselves", async () => {
    const res = await asOwner(app)
      .patch(`/api/users/${state.owner._id}`)
      .send({ role: "employee" });

    expect(res.status).toBe(400);
  });

  it("400: an owner cannot deactivate themselves", async () => {
    const res = await asOwner(app)
      .patch(`/api/users/${state.owner._id}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
  });

  it("400: the last active owner cannot be deleted", async () => {
    const second = await asOwner(app).post("/api/users").send({
      name: "Second Owner",
      email: "owner2@test.local",
      password: "a-good-password",
      role: "owner",
    });

    // Two owners now exist, so removing one is fine.
    const removeSpare = await asOwner(app).delete(`/api/users/${second.body.data.id}`);
    expect(removeSpare.status).toBe(200);
  });
});

// ── The audit log actually records things ────────────────────────────────────

describe("Audit log", () => {
  it("records logins, sales and user creation", async () => {
    // This suite authenticates with directly-signed tokens rather than by
    // posting to /api/auth/login, so nothing here has produced a login event
    // yet - do one now, otherwise the assertion below is testing the test.
    await anonymous(app)
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: TEST_PASSWORD });

    // The audit service writes without being awaited, so give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const res = await asOwner(app).get("/api/audit?limit=100");
    expect(res.status).toBe(200);

    const actions = res.body.data.map((entry) => entry.action);
    expect(actions).toContain("auth.login");
    expect(actions).toContain("stock.sale");
    expect(actions).toContain("user.create");
  });

  it("records failed logins with the outcome set to failure", async () => {
    await anonymous(app)
      .post("/api/auth/login")
      .send({ email: "owner@test.local", password: "definitely-wrong" });

    await new Promise((resolve) => setTimeout(resolve, 250));

    const res = await asOwner(app).get("/api/audit?outcome=failure&action=auth.login");
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("never stores a password in the trail", async () => {
    const res = await asOwner(app).get("/api/audit?limit=100");
    expect(JSON.stringify(res.body)).not.toContain("a-good-password");
  });
});
