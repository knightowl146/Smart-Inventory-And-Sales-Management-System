/**
 * Tests for:
 *  1. GET  /api/analytics/supplier-performance  (getSupplierPerformance)
 *  2. POST /api/customers                       (createCustomer)
 *     GET  /api/customers                       (getCustomers)
 *     GET  /api/customers/:id                   (getCustomerById)
 *     PATCH /api/customers/:id                  (updateCustomer)
 *     DELETE /api/customers/:id                 (deleteCustomer)
 *  3. POST /api/products/:id/sell               (sellProduct — with customerId + transaction)
 *
 * Uses MongoMemoryServer + supertest (no real DB required).
 *
 * NOTE: MongoMemoryServer does NOT support multi-document transactions by default
 * (requires a replica-set URI).  For the sell tests we call the endpoint and
 * verify the business logic that runs BEFORE the transaction (validation checks)
 * which still works fine.  Transaction tests that need a replica set are marked
 * as such in comments.
 */

const request  = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app      = require("../app");

// ─── Shared state ──────────────────────────────────────────────────────────────
let mongoServer;
let supplierAId, supplierBId;
let productId;
let customerAId, customerBId;

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Use a replica set so MongoDB transactions work (required by sellProduct)
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const sA = await request(app).post("/api/suppliers").send({
    name : "Supplier Alpha",
    email: "alpha@supply.com",
    phone: "1111111111",
  });
  supplierAId = sA.body.data._id;

  const sB = await request(app).post("/api/suppliers").send({
    name : "Supplier Beta",
    email: "beta@supply.com",
    phone: "2222222222",
  });
  supplierBId = sB.body.data._id;

  // ── Products ───────────────────────────────────────────────────────────────
  const pRes = await request(app).post("/api/products").send({
    name         : "Sell Test Widget",
    sku          : "STW-001",
    category     : "Electronics",
    purchasePrice: 40,
    sellingPrice : 80,
    unitPrice    : 80,
    quantity     : 300,
    description  : "Widget for sell tests",
  });
  productId = pRes.body.data._id;

  // ── Customers ──────────────────────────────────────────────────────────────
  const cA = await request(app).post("/api/customers").send({
    name : "Customer Alpha",
    phone: "3333333333",
    email: "alpha@customer.com",
  });
  customerAId = cA.body.customer._id;

  const cB = await request(app).post("/api/customers").send({
    name   : "Customer Beta",
    phone  : "4444444444",
    address: "123 Beta Street",
  });
  customerBId = cB.body.customer._id;

  // ── Purchases (for supplier-performance) ──────────────────────────────────
  // Alpha: 3 purchases (100 units @ $40)
  for (let i = 0; i < 3; i++) {
    await request(app)
      .post(`/api/products/${productId}/purchase`)
      .send({ quantity: 100, unitPrice: 40, supplierId: supplierAId });
  }
  // Beta: 1 purchase (50 units @ $30)
  await request(app)
    .post(`/api/products/${productId}/purchase`)
    .send({ quantity: 50, unitPrice: 30, supplierId: supplierBId });
});

// ─── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER CRUD  —  /api/customers
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/customers — createCustomer", () => {

  it("201: creates a customer with name and phone only", async () => {
    const res = await request(app).post("/api/customers").send({
      name : "Test Create Customer",
      phone: "5000000001",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("customer");
    expect(res.body.customer).toHaveProperty("_id");
    expect(res.body.customer.name).toBe("Test Create Customer");
    expect(res.body.customer.phone).toBe("5000000001");
  });

  it("201: creates a customer with all optional fields (email, address)", async () => {
    const res = await request(app).post("/api/customers").send({
      name   : "Full Detail Customer",
      phone  : "5000000002",
      email  : "full@detail.com",
      address: "456 Full Street",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.customer.email).toBe("full@detail.com");
    expect(res.body.customer.address).toBe("456 Full Street");
  });

  it("201: email is stored lowercase", async () => {
    const res = await request(app).post("/api/customers").send({
      name : "Lowercase Email Customer",
      phone: "5000000003",
      email: "UPPER@EMAIL.COM",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.customer.email).toBe("upper@email.com");
  });

  it("400: missing name returns 400", async () => {
    const res = await request(app).post("/api/customers").send({
      phone: "5000000099",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("400: missing phone returns 400", async () => {
    const res = await request(app).post("/api/customers").send({
      name: "No Phone Customer",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("400: empty name returns 400", async () => {
    const res = await request(app).post("/api/customers").send({
      name : "",
      phone: "5000000098",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("409: duplicate phone returns 409", async () => {
    // First create
    await request(app).post("/api/customers").send({
      name : "Dup Phone First",
      phone: "5500000001",
    });
    // Duplicate
    const res = await request(app).post("/api/customers").send({
      name : "Dup Phone Second",
      phone: "5500000001",
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("201: response has createdAt and updatedAt timestamps", async () => {
    const res = await request(app).post("/api/customers").send({
      name : "Timestamp Customer",
      phone: "5000000010",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.customer).toHaveProperty("createdAt");
    expect(res.body.customer).toHaveProperty("updatedAt");
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe("GET /api/customers — getCustomers", () => {

  it("200: returns count and customers array", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("count");
    expect(res.body).toHaveProperty("customers");
    expect(Array.isArray(res.body.customers)).toBe(true);
  });

  it("200: count equals customers array length", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.body.count).toBe(res.body.customers.length);
  });

  it("200: Alpha and Beta customers from setup are included", async () => {
    const res = await request(app).get("/api/customers");
    const names = res.body.customers.map((c) => c.name);
    expect(names).toContain("Customer Alpha");
    expect(names).toContain("Customer Beta");
  });

  it("200: customers are sorted newest first (createdAt descending)", async () => {
    const res = await request(app).get("/api/customers");
    const dates = res.body.customers.map((c) => new Date(c.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  it("200: each customer has _id, name, phone", async () => {
    const res = await request(app).get("/api/customers");
    res.body.customers.forEach((c) => {
      expect(c).toHaveProperty("_id");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("phone");
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe("GET /api/customers/:id — getCustomerById", () => {

  it("200: returns the correct customer by ID", async () => {
    const res = await request(app).get(`/api/customers/${customerAId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("customer");
    expect(res.body.customer._id).toBe(customerAId);
    expect(res.body.customer.name).toBe("Customer Alpha");
  });

  it("200: returned customer has expected fields", async () => {
    const res = await request(app).get(`/api/customers/${customerAId}`);
    expect(res.body.customer).toHaveProperty("_id");
    expect(res.body.customer).toHaveProperty("name");
    expect(res.body.customer).toHaveProperty("phone");
    expect(res.body.customer).toHaveProperty("createdAt");
    expect(res.body.customer).toHaveProperty("updatedAt");
  });

  it("400: invalid ObjectId returns 400", async () => {
    const res = await request(app).get("/api/customers/not-an-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid customer id/i);
  });

  it("404: valid but non-existent ID returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/customers/${fakeId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/customers/:id — updateCustomer", () => {

  let patchCustomerId;

  beforeAll(async () => {
    const res = await request(app).post("/api/customers").send({
      name : "Patch Target Customer",
      phone: "6000000001",
      email: "patch@target.com",
    });
    patchCustomerId = res.body.customer._id;
  });

  it("200: updates name", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ name: "Updated Name" });
    expect(res.statusCode).toBe(200);
    expect(res.body.customer.name).toBe("Updated Name");
  });

  it("200: updates phone", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ phone: "6000000099" });
    expect(res.statusCode).toBe(200);
    expect(res.body.customer.phone).toBe("6000000099");
  });

  it("200: updates email", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ email: "new@email.com" });
    expect(res.statusCode).toBe(200);
    expect(res.body.customer.email).toBe("new@email.com");
  });

  it("200: updates address", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ address: "789 New Road" });
    expect(res.statusCode).toBe(200);
    expect(res.body.customer.address).toBe("789 New Road");
  });

  it("200: unpatched fields remain unchanged", async () => {
    // Patch only name
    await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ name: "Stable Name" });

    const res = await request(app).get(`/api/customers/${patchCustomerId}`);
    expect(res.body.customer.name).toBe("Stable Name");
    // phone should still be the patched phone from earlier test
    expect(res.body.customer.phone).toBeDefined();
  });

  it("200: response has success message and customer object", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ name: "Final Name" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("customer");
  });

  it("400: invalid ObjectId returns 400", async () => {
    const res = await request(app)
      .patch("/api/customers/bad-id")
      .send({ name: "X" });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid customer id/i);
  });

  it("404: valid but non-existent ID returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/customers/${fakeId}`)
      .send({ name: "X" });
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("400: empty name string returns 400", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ name: "   " });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot be empty/i);
  });

  it("400: empty phone string returns 400", async () => {
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ phone: "   " });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot be empty/i);
  });

  it("409: updating phone to one already used by another customer returns 409", async () => {
    // customerA phone is "3333333333"
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ phone: "3333333333" });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("200: updating phone to the same value is a no-op (200)", async () => {
    // Get current phone
    const getRes = await request(app).get(`/api/customers/${patchCustomerId}`);
    const currentPhone = getRes.body.customer.phone;
    const res = await request(app)
      .patch(`/api/customers/${patchCustomerId}`)
      .send({ phone: currentPhone });
    expect(res.statusCode).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/customers/:id — deleteCustomer", () => {

  let deleteTargetId;

  beforeAll(async () => {
    const res = await request(app).post("/api/customers").send({
      name : "Delete Target Customer",
      phone: "7000000001",
    });
    deleteTargetId = res.body.customer._id;
  });

  it("200: deletes an existing customer", async () => {
    const res = await request(app).delete(`/api/customers/${deleteTargetId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  it("404: deleted customer is no longer retrievable", async () => {
    const res = await request(app).get(`/api/customers/${deleteTargetId}`);
    expect(res.statusCode).toBe(404);
  });

  it("400: invalid ObjectId returns 400", async () => {
    const res = await request(app).delete("/api/customers/bad-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid customer id/i);
  });

  it("404: valid but non-existent ID returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/api/customers/${fakeId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// SELL PRODUCT (updated)  —  POST /api/products/:id/sell
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/products/:id/sell — sellProduct (updated)", () => {

  it("400: missing customerId returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: 80 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/customer id is required/i);
  });

  it("400: invalid customerId format returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: 80, customerId: "not-valid" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid customer id/i);
  });

  it("404: valid but non-existent customerId returns 404", async () => {
    const fakeCustomerId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: 80, customerId: fakeCustomerId });
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/customer not found/i);
  });

  it("400: invalid product id returns 400", async () => {
    const res = await request(app)
      .post("/api/products/bad-id/sell")
      .send({ quantity: 1, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid id/i);
  });

  it("400: missing unitPrice returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unit price/i);
  });

  it("400: unitPrice as string returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: "eighty", customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: negative unitPrice returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: -5, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/cannot be negative/i);
  });

  it("400: missing quantity returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: quantity = 0 returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 0, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/greater than 0/i);
  });

  it("400: negative quantity returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: -3, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: fractional quantity returns 400", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1.5, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/integer/i);
  });

  it("200: valid sell with existing customer succeeds", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 10, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/sold successfully/i);
  });

  it("200: product quantity is decremented after sale", async () => {
    // Get current stock
    const before = await request(app).get(`/api/products/${productId}`);
    const beforeQty = before.body.data.quantity;

    await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 5, unitPrice: 80, customerId: customerBId });

    const after = await request(app).get(`/api/products/${productId}`);
    expect(after.body.data.quantity).toBe(beforeQty - 5);
  });

  it("400: selling more than available stock returns 400", async () => {
    const productRes = await request(app).get(`/api/products/${productId}`);
    const currentQty = productRes.body.data.quantity;

    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: currentQty + 999, unitPrice: 80, customerId: customerAId });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/insufficient stock/i);
  });

  it("200: response data includes updated product", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 2, unitPrice: 80, customerId: customerBId });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data).toHaveProperty("quantity");
  });

  it("200: unitPrice=0 is allowed (zero-price clearance sale)", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 1, unitPrice: 0, customerId: customerAId });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// SUPPLIER PERFORMANCE  —  GET /api/analytics/supplier-performance
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/supplier-performance", () => {

  // ── Response shape ───────────────────────────────────────────────────────
  it("200: responds with success=true", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200: response has filters, summary, and suppliers keys", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(res.body).toHaveProperty("filters");
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("suppliers");
  });

  it("200: filters has startDate, endDate, limit", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(res.body.filters).toHaveProperty("startDate");
    expect(res.body.filters).toHaveProperty("endDate");
    expect(res.body.filters).toHaveProperty("limit");
  });

  it("200: summary has totalSuppliers, totalPurchaseTransactions, totalQuantityPurchased, totalPurchaseValue", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    const { summary } = res.body;
    expect(summary).toHaveProperty("totalSuppliers");
    expect(summary).toHaveProperty("totalPurchaseTransactions");
    expect(summary).toHaveProperty("totalQuantityPurchased");
    expect(summary).toHaveProperty("totalPurchaseValue");
  });

  it("200: suppliers is an array", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(Array.isArray(res.body.suppliers)).toBe(true);
  });

  it("200: both suppliers (Alpha and Beta) appear in the result", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const names = res.body.suppliers.map((s) => s.supplierName);
    expect(names).toContain("Supplier Alpha");
    expect(names).toContain("Supplier Beta");
  });

  it("200: each supplier entry has required fields", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    res.body.suppliers.forEach((s) => {
      expect(s).toHaveProperty("supplierId");
      expect(s).toHaveProperty("supplierName");
      expect(s).toHaveProperty("totalPurchases");
      expect(s).toHaveProperty("totalQuantityPurchased");
      expect(s).toHaveProperty("totalPurchaseValue");
      expect(s).toHaveProperty("averagePurchaseValue");
      expect(s).toHaveProperty("lastPurchaseDate");
      expect(s).toHaveProperty("firstPurchaseDate");
    });
  });

  it("200: Supplier Alpha has totalPurchases=3 (3 purchase transactions)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const alpha = res.body.suppliers.find((s) => s.supplierName === "Supplier Alpha");
    expect(alpha).toBeDefined();
    expect(alpha.totalPurchases).toBe(3);
  });

  it("200: Supplier Beta has totalPurchases=1", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const beta = res.body.suppliers.find((s) => s.supplierName === "Supplier Beta");
    expect(beta).toBeDefined();
    expect(beta.totalPurchases).toBe(1);
  });

  it("200: Supplier Alpha totalQuantityPurchased = 300 (3 x 100)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const alpha = res.body.suppliers.find((s) => s.supplierName === "Supplier Alpha");
    expect(alpha.totalQuantityPurchased).toBe(300);
  });

  it("200: Supplier Beta totalQuantityPurchased = 50", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const beta = res.body.suppliers.find((s) => s.supplierName === "Supplier Beta");
    expect(beta.totalQuantityPurchased).toBe(50);
  });

  it("200: Supplier Alpha totalPurchaseValue = 12000 (300 units × $40)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const alpha = res.body.suppliers.find((s) => s.supplierName === "Supplier Alpha");
    expect(alpha.totalPurchaseValue).toBeCloseTo(12000, 2);
  });

  it("200: Supplier Beta totalPurchaseValue = 1500 (50 units × $30)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const beta = res.body.suppliers.find((s) => s.supplierName === "Supplier Beta");
    expect(beta.totalPurchaseValue).toBeCloseTo(1500, 2);
  });

  it("200: averagePurchaseValue = totalPurchaseValue / totalPurchases", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    res.body.suppliers.forEach((s) => {
      const expected = Number((s.totalPurchaseValue / s.totalPurchases).toFixed(2));
      expect(s.averagePurchaseValue).toBeCloseTo(expected, 2);
    });
  });

  it("200: suppliers sorted by totalPurchaseValue descending (Alpha > Beta)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const values = res.body.suppliers.map((s) => s.totalPurchaseValue);
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }
    const names = res.body.suppliers.map((s) => s.supplierName);
    expect(names.indexOf("Supplier Alpha")).toBeLessThan(
      names.indexOf("Supplier Beta")
    );
  });

  it("200: summary.totalSuppliers = 2 (Alpha + Beta)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    expect(res.body.summary.totalSuppliers).toBe(2);
  });

  it("200: summary.totalPurchaseTransactions = 4 (3+1)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    expect(res.body.summary.totalPurchaseTransactions).toBe(4);
  });

  it("200: summary.totalQuantityPurchased = 350 (300+50)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    expect(res.body.summary.totalQuantityPurchased).toBe(350);
  });

  it("200: summary.totalPurchaseValue = 13500 (12000+1500)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    expect(res.body.summary.totalPurchaseValue).toBeCloseTo(13500, 2);
  });

  it("200: lastPurchaseDate is a valid date string", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    res.body.suppliers.forEach((s) => {
      expect(new Date(s.lastPurchaseDate).getTime()).not.toBeNaN();
    });
  });

  it("200: firstPurchaseDate <= lastPurchaseDate for each supplier", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    res.body.suppliers.forEach((s) => {
      const first = new Date(s.firstPurchaseDate).getTime();
      const last  = new Date(s.lastPurchaseDate).getTime();
      expect(first).toBeLessThanOrEqual(last);
    });
  });

  // ── limit param ──────────────────────────────────────────────────────────
  it("200: limit=1 returns at most 1 supplier (Supplier Alpha, highest value)", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=1");
    expect(res.statusCode).toBe(200);
    expect(res.body.suppliers.length).toBeLessThanOrEqual(1);
    if (res.body.suppliers.length === 1) {
      expect(res.body.suppliers[0].supplierName).toBe("Supplier Alpha");
    }
  });

  it("200: limit=999 is clamped to 100 in filters.limit", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=999");
    expect(res.statusCode).toBe(200);
    expect(res.body.filters.limit).toBe(100);
    expect(res.body.suppliers.length).toBeLessThanOrEqual(100);
  });

  it("200: invalid limit falls back to 10", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=xyz");
    expect(res.statusCode).toBe(200);
    expect(res.body.suppliers.length).toBeLessThanOrEqual(10);
  });

  it("200: no limit param defaults to 10 in filters", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(res.body.filters.limit).toBe(10);
  });

  // ── Date filters ─────────────────────────────────────────────────────────
  it("200: future startDate returns empty suppliers but valid summary structure", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(
      `/api/analytics/supplier-performance?startDate=${future.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suppliers).toHaveLength(0);
    expect(res.body.summary.totalSuppliers).toBe(0);
    expect(res.body.summary.totalPurchaseValue).toBe(0);
  });

  it("200: past endDate returns empty suppliers", async () => {
    const past = new Date("2000-01-01");
    const res = await request(app).get(
      `/api/analytics/supplier-performance?endDate=${past.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.suppliers).toHaveLength(0);
  });

  it("200: date range covering today returns data", async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const res = await request(app).get(
      `/api/analytics/supplier-performance?startDate=${start.toISOString()}&endDate=${end.toISOString()}&limit=10`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.suppliers.length).toBeGreaterThan(0);
  });

  it("400: invalid startDate string returns 400", async () => {
    const res = await request(app).get(
      "/api/analytics/supplier-performance?startDate=not-a-date"
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid startdate/i);
  });

  it("400: invalid endDate string returns 400", async () => {
    const res = await request(app).get(
      "/api/analytics/supplier-performance?endDate=not-a-date"
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid enddate/i);
  });

  it("200: no date filter returns all-time data with null startDate/endDate in filters", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance");
    expect(res.body.filters.startDate).toBeNull();
    expect(res.body.filters.endDate).toBeNull();
  });

  it("200: supplierEmail and supplierPhone are present for suppliers with that info", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    const alpha = res.body.suppliers.find((s) => s.supplierName === "Supplier Alpha");
    expect(alpha.supplierEmail).toBe("alpha@supply.com");
    expect(alpha.supplierPhone).toBe("1111111111");
  });

  it("200: all numeric supplier fields are non-negative", async () => {
    const res = await request(app).get("/api/analytics/supplier-performance?limit=10");
    res.body.suppliers.forEach((s) => {
      expect(s.totalPurchases).toBeGreaterThan(0);
      expect(s.totalQuantityPurchased).toBeGreaterThan(0);
      expect(s.totalPurchaseValue).toBeGreaterThan(0);
      expect(s.averagePurchaseValue).toBeGreaterThan(0);
    });
  });
});
