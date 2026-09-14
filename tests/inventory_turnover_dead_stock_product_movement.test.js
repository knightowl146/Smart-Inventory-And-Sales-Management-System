/**
 * Tests for:
 *  - GET /api/analytics/inventory-turnover  (getInventoryTurnover)
 *  - GET /api/analytics/dead-stock          (getDeadStock)
 *  - GET /api/analytics/product-movement    (getProductMovement)
 *
 * Uses MongoMemoryServer + supertest so no real DB is needed.
 */

const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");

// ─── Shared state ──────────────────────────────────────────────────────────────
let mongoServer;
let testSupplierId;
let testCustomerId;
let productAlphaId, productBetaId, productGammaId;

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  // Create a supplier (required for PURCHASE movements)
  const supplierRes = await request(app).post("/api/suppliers").send({
    name: "Turnover Test Supplier",
    email: "turnover@test.com",
    phone: "9999999999",
  });
  testSupplierId = supplierRes.body.data._id;

  const customerRes = await request(app).post("/api/customers").send({
    name: "Turnover Test Customer",
    email: "turnover@customer.com",
    phone: "8888888888",
  });
  testCustomerId = customerRes.body.customer._id;

  // Alpha – Electronics, high movement
  const pA = await request(app).post("/api/products").send({
    name: "Turnover Alpha",
    sku: "TA-001",
    category: "Electronics",
    purchasePrice: 50,
    sellingPrice: 100,
    unitPrice: 100,
    quantity: 200,
    description: "Alpha product for turnover tests",
  });
  productAlphaId = pA.body.data._id;

  // Beta – Electronics, medium movement
  const pB = await request(app).post("/api/products").send({
    name: "Turnover Beta",
    sku: "TB-002",
    category: "Electronics",
    purchasePrice: 20,
    sellingPrice: 40,
    unitPrice: 40,
    quantity: 200,
    description: "Beta product for turnover tests",
  });
  productBetaId = pB.body.data._id;

  // Gamma – Tools, never sold (dead stock candidate)
  const pC = await request(app).post("/api/products").send({
    name: "Turnover Gamma",
    sku: "TG-003",
    category: "Tools",
    purchasePrice: 10,
    sellingPrice: 25,
    unitPrice: 25,
    quantity: 100,
    description: "Gamma product – never sold",
  });
  productGammaId = pC.body.data._id;

  // Sell Alpha: 40 units @ 100 each → revenue = 4000, COGS = 40*50 = 2000
  await request(app)
    .post(`/api/products/${productAlphaId}/sell`)
    .send({ quantity: 40, unitPrice: 100, customerId: testCustomerId });

  // Sell Beta: 15 units @ 40 each → revenue = 600, COGS = 15*20 = 300
  await request(app)
    .post(`/api/products/${productBetaId}/sell`)
    .send({ quantity: 15, unitPrice: 40, customerId: testCustomerId });

  // Purchase Alpha: 50 units
  await request(app)
    .post(`/api/products/${productAlphaId}/purchase`)
    .send({ quantity: 50, unitPrice: 50, supplierId: testSupplierId });
});

// ─── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY TURNOVER  —  GET /api/analytics/inventory-turnover
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-turnover", () => {

  // ── Response shape ───────────────────────────────────────────────────────
  it("200: responds with success=true", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200: response has summary and products keys", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("products");
  });

  it("200: summary contains totalCOGS, totalInventoryValue, inventoryTurnoverRatio", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    const { summary } = res.body;
    expect(summary).toHaveProperty("totalCOGS");
    expect(summary).toHaveProperty("totalInventoryValue");
    expect(summary).toHaveProperty("inventoryTurnoverRatio");
  });

  it("200: summary values are non-negative numbers", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    const { summary } = res.body;
    expect(typeof summary.totalCOGS).toBe("number");
    expect(typeof summary.totalInventoryValue).toBe("number");
    expect(typeof summary.inventoryTurnoverRatio).toBe("number");
    expect(summary.totalCOGS).toBeGreaterThanOrEqual(0);
    expect(summary.totalInventoryValue).toBeGreaterThanOrEqual(0);
    expect(summary.inventoryTurnoverRatio).toBeGreaterThanOrEqual(0);
  });

  it("200: products is an array", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it("200: each product entry has required fields", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    res.body.products.forEach((item) => {
      expect(item).toHaveProperty("productId");
      expect(item).toHaveProperty("productName");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("quantitySold");
      expect(item).toHaveProperty("costOfGoodsSold");
      expect(item).toHaveProperty("currentInventoryValue");
      expect(item).toHaveProperty("turnoverRatio");
    });
  });

  it("200: all numeric product fields are non-negative", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    res.body.products.forEach((item) => {
      expect(item.quantitySold).toBeGreaterThanOrEqual(0);
      expect(item.costOfGoodsSold).toBeGreaterThanOrEqual(0);
      expect(item.currentInventoryValue).toBeGreaterThanOrEqual(0);
      expect(item.turnoverRatio).toBeGreaterThanOrEqual(0);
    });
  });

  it("200: turnoverRatio = COGS / currentInventoryValue (or 0 when no inventory)", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    res.body.products.forEach((item) => {
      if (item.currentInventoryValue > 0) {
        const expected = Number(
          (item.costOfGoodsSold / item.currentInventoryValue).toFixed(2)
        );
        expect(item.turnoverRatio).toBeCloseTo(expected, 2);
      } else {
        expect(item.turnoverRatio).toBe(0);
      }
    });
  });

  it("200: totalInventoryValue is positive (all products have stock)", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    expect(res.body.summary.totalInventoryValue).toBeGreaterThan(0);
  });

  // ── limit param ──────────────────────────────────────────────────────────
  it("200: limit=1 returns at most 1 product", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory-turnover?limit=1"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(1);
  });

  it("200: limit=999 is clamped to max 100", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory-turnover?limit=999"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(100);
  });

  it("200: invalid limit falls back to default (<=10 products)", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory-turnover?limit=abc"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(10);
  });

  it("200: limit=0 treated as default (Math.max(parseInt('0')||10,1) = 10)", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory-turnover?limit=0"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(10);
  });

  // ── Date filters ─────────────────────────────────────────────────────────
  it("200: future startDate returns empty products and totalCOGS=0", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(
      `/api/analytics/inventory-turnover?startDate=${future.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.products).toHaveLength(0);
    expect(res.body.summary.totalCOGS).toBe(0);
  });

  it("200: past endDate returns empty products", async () => {
    const past = new Date("2000-01-01");
    const res = await request(app).get(
      `/api/analytics/inventory-turnover?endDate=${past.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  it("200: date range covering today returns product data", async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const res = await request(app).get(
      `/api/analytics/inventory-turnover?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it("200: inventoryTurnoverRatio is always >= 0", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.body.summary.inventoryTurnoverRatio).toBeGreaterThanOrEqual(0);
  });

  it("200: summary.totalCOGS >= sum of product costOfGoodsSold in returned slice", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory-turnover?limit=100"
    );
    expect(res.statusCode).toBe(200);
    const sumCOGS = res.body.products.reduce(
      (acc, p) => acc + p.costOfGoodsSold,
      0
    );
    expect(res.body.summary.totalCOGS).toBeGreaterThanOrEqual(
      parseFloat(sumCOGS.toFixed(2)) - 0.01
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// DEAD STOCK  —  GET /api/analytics/dead-stock
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/dead-stock", () => {

  // ── Response shape ───────────────────────────────────────────────────────
  it("200: responds with success=true", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200: response has days, summary, and products keys", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("days");
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("products");
  });

  it("200: summary contains deadStockProducts, deadStockQuantity, deadStockValue, potentialRevenue", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    const { summary } = res.body;
    expect(summary).toHaveProperty("deadStockProducts");
    expect(summary).toHaveProperty("deadStockQuantity");
    expect(summary).toHaveProperty("deadStockValue");
    expect(summary).toHaveProperty("potentialRevenue");
  });

  it("200: summary values are non-negative numbers", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    const { summary } = res.body;
    expect(typeof summary.deadStockProducts).toBe("number");
    expect(typeof summary.deadStockQuantity).toBe("number");
    expect(typeof summary.deadStockValue).toBe("number");
    expect(typeof summary.potentialRevenue).toBe("number");
    expect(summary.deadStockProducts).toBeGreaterThanOrEqual(0);
    expect(summary.deadStockQuantity).toBeGreaterThanOrEqual(0);
    expect(summary.deadStockValue).toBeGreaterThanOrEqual(0);
    expect(summary.potentialRevenue).toBeGreaterThanOrEqual(0);
  });

  it("200: summary.deadStockProducts >= products array length (limit may slice)", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    expect(res.body.summary.deadStockProducts).toBeGreaterThanOrEqual(
      res.body.products.length
    );
  });

  it("200: products is an array", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it("200: each product entry has required fields", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    expect(res.statusCode).toBe(200);
    res.body.products.forEach((item) => {
      expect(item).toHaveProperty("productId");
      expect(item).toHaveProperty("productName");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("quantity");
      expect(item).toHaveProperty("purchasePrice");
      expect(item).toHaveProperty("sellingPrice");
      expect(item).toHaveProperty("inventoryValue");
      expect(item).toHaveProperty("potentialRevenue");
      expect(item).toHaveProperty("lastSaleDate");
      expect(item).toHaveProperty("daysSinceLastSale");
      expect(item).toHaveProperty("totalQuantitySold");
    });
  });

  it("200: inventoryValue = quantity * purchasePrice for each product", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    res.body.products.forEach((item) => {
      const expected = Number(
        (item.quantity * item.purchasePrice).toFixed(2)
      );
      expect(item.inventoryValue).toBeCloseTo(expected, 2);
    });
  });

  it("200: potentialRevenue = quantity * sellingPrice for each product", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    res.body.products.forEach((item) => {
      const expected = Number(
        (item.quantity * item.sellingPrice).toFixed(2)
      );
      expect(item.potentialRevenue).toBeCloseTo(expected, 2);
    });
  });

  it("200: products sorted by inventoryValue descending (highest blocked value first)", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    const values = res.body.products.map((p) => p.inventoryValue);
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }
  });

  it("200: 'Turnover Gamma' (never sold) is classified as dead stock with days=30", async () => {
    const res = await request(app).get(
      "/api/analytics/dead-stock?days=30&limit=100"
    );
    expect(res.statusCode).toBe(200);
    const gamma = res.body.products.find(
      (p) => p.productName === "Turnover Gamma"
    );
    expect(gamma).toBeDefined();
    expect(gamma.lastSaleDate).toBeNull();
    expect(gamma.daysSinceLastSale).toBeNull();
    expect(gamma.totalQuantitySold).toBe(0);
  });

  it("200: days defaults to 30 when not provided", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    expect(res.statusCode).toBe(200);
    expect(res.body.days).toBe(30);
  });

  // ── days param ───────────────────────────────────────────────────────────
  it("200: days=1 uses 1-day window and Gamma is still dead stock", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?days=1");
    expect(res.statusCode).toBe(200);
    expect(res.body.days).toBe(1);
    const gamma = res.body.products.find(
      (p) => p.productName === "Turnover Gamma"
    );
    expect(gamma).toBeDefined();
  });

  it("200: days=9999 is clamped to 3650", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?days=9999");
    expect(res.statusCode).toBe(200);
    expect(res.body.days).toBe(3650);
  });

  it("200: days=0 falls back to default 30 (parseInt('0')||30 = 30)", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?days=0");
    expect(res.statusCode).toBe(200);
    // parseInt("0") = 0 which is falsy → 0 || 30 = 30 → Math.max(30,1) = 30
    expect(res.body.days).toBe(30);
  });

  it("200: non-numeric days (abc) falls back to default 30", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?days=abc");
    expect(res.statusCode).toBe(200);
    expect(res.body.days).toBe(30);
  });

  // ── limit param ──────────────────────────────────────────────────────────
  it("200: limit=1 returns at most 1 product", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=1");
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(1);
  });

  it("200: limit=999 is clamped to max 100 products", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=999");
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(100);
  });

  it("200: invalid limit string (xyz) falls back to 10", async () => {
    const res = await request(app).get(
      "/api/analytics/dead-stock?limit=xyz"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.products.length).toBeLessThanOrEqual(10);
  });

  // ── Summary aggregation ──────────────────────────────────────────────────
  it("200: summary.deadStockQuantity >= total quantity in products slice", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    const totalQty = res.body.products.reduce(
      (sum, p) => sum + p.quantity,
      0
    );
    expect(res.body.summary.deadStockQuantity).toBeGreaterThanOrEqual(totalQty);
  });

  it("200: potentialRevenue >= deadStockValue (selling price >= purchase price in test data)", async () => {
    const res = await request(app).get("/api/analytics/dead-stock");
    if (res.body.summary.deadStockProducts > 0) {
      expect(res.body.summary.potentialRevenue).toBeGreaterThanOrEqual(
        res.body.summary.deadStockValue
      );
    }
  });

  it("200: dead stock products all have quantity > 0", async () => {
    const res = await request(app).get("/api/analytics/dead-stock?limit=100");
    res.body.products.forEach((item) => {
      expect(item.quantity).toBeGreaterThan(0);
    });
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT MOVEMENT  —  GET /api/analytics/product-movement
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/product-movement", () => {

  // ── Response shape ───────────────────────────────────────────────────────
  it("200: responds with success=true", async () => {
    const res = await request(app).get("/api/analytics/product-movement");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200: response has fastMoving and slowMoving arrays", async () => {
    const res = await request(app).get("/api/analytics/product-movement");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("fastMoving");
    expect(res.body).toHaveProperty("slowMoving");
    expect(Array.isArray(res.body.fastMoving)).toBe(true);
    expect(Array.isArray(res.body.slowMoving)).toBe(true);
  });

  it("200: response has filters object with startDate, endDate, limit", async () => {
    const res = await request(app).get("/api/analytics/product-movement");
    expect(res.body).toHaveProperty("filters");
    expect(res.body.filters).toHaveProperty("startDate");
    expect(res.body.filters).toHaveProperty("endDate");
    expect(res.body.filters).toHaveProperty("limit");
  });

  it("200: each fastMoving entry has required product fields", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    expect(res.statusCode).toBe(200);
    res.body.fastMoving.forEach((item) => {
      expect(item).toHaveProperty("productId");
      expect(item).toHaveProperty("productName");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("currentStock");
      expect(item).toHaveProperty("quantitySold");
      expect(item).toHaveProperty("salesCount");
      expect(item).toHaveProperty("revenue");
    });
  });

  it("200: each slowMoving entry has required product fields", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    expect(res.statusCode).toBe(200);
    res.body.slowMoving.forEach((item) => {
      expect(item).toHaveProperty("productId");
      expect(item).toHaveProperty("productName");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("currentStock");
      expect(item).toHaveProperty("quantitySold");
      expect(item).toHaveProperty("salesCount");
      expect(item).toHaveProperty("revenue");
    });
  });

  it("200: fastMoving sorted descending by quantitySold", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    const quantities = res.body.fastMoving.map((p) => p.quantitySold);
    for (let i = 0; i < quantities.length - 1; i++) {
      expect(quantities[i]).toBeGreaterThanOrEqual(quantities[i + 1]);
    }
  });

  it("200: slowMoving sorted ascending by quantitySold", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    const quantities = res.body.slowMoving.map((p) => p.quantitySold);
    for (let i = 0; i < quantities.length - 1; i++) {
      expect(quantities[i]).toBeLessThanOrEqual(quantities[i + 1]);
    }
  });

  it("200: Alpha (40 units) ranks above Beta (15 units) in fastMoving", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=10"
    );
    expect(res.statusCode).toBe(200);
    const names = res.body.fastMoving.map((p) => p.productName);
    const alphaIdx = names.indexOf("Turnover Alpha");
    const betaIdx = names.indexOf("Turnover Beta");
    if (betaIdx !== -1 && alphaIdx !== -1) {
      expect(alphaIdx).toBeLessThan(betaIdx);
    } else {
      // At minimum, Alpha must appear in fastMoving
      expect(alphaIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it("200: Beta (15 units) ranks above Alpha (40 units) in slowMoving", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=10"
    );
    expect(res.statusCode).toBe(200);
    const names = res.body.slowMoving.map((p) => p.productName);
    const alphaIdx = names.indexOf("Turnover Alpha");
    const betaIdx = names.indexOf("Turnover Beta");
    if (alphaIdx !== -1 && betaIdx !== -1) {
      expect(betaIdx).toBeLessThan(alphaIdx);
    } else {
      // At minimum, Beta must appear in slowMoving
      expect(betaIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it("200: quantitySold and salesCount are positive integers for sold products", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    res.body.fastMoving.forEach((item) => {
      expect(Number.isInteger(item.quantitySold)).toBe(true);
      expect(item.quantitySold).toBeGreaterThan(0);
      expect(Number.isInteger(item.salesCount)).toBe(true);
      expect(item.salesCount).toBeGreaterThan(0);
    });
  });

  it("200: revenue is a non-negative number for all fastMoving products", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    res.body.fastMoving.forEach((item) => {
      expect(typeof item.revenue).toBe("number");
      expect(item.revenue).toBeGreaterThanOrEqual(0);
    });
  });

  it("200: fastMoving and slowMoving both have the same set of product IDs", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    const fastIds = new Set(
      res.body.fastMoving.map((p) => String(p.productId))
    );
    const slowIds = new Set(
      res.body.slowMoving.map((p) => String(p.productId))
    );
    // Both lists come from the same aggregation data – same products
    expect([...fastIds].sort()).toEqual([...slowIds].sort());
  });

  // ── limit param ──────────────────────────────────────────────────────────
  it("200: limit=1 returns at most 1 product in each list", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=1"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving.length).toBeLessThanOrEqual(1);
    expect(res.body.slowMoving.length).toBeLessThanOrEqual(1);
  });

  it("200: limit=999 is clamped to 100 in filters.limit", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=999"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving.length).toBeLessThanOrEqual(100);
    expect(res.body.slowMoving.length).toBeLessThanOrEqual(100);
    expect(res.body.filters.limit).toBe(100);
  });

  it("200: invalid limit (abc) falls back to default 10", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=abc"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving.length).toBeLessThanOrEqual(10);
    expect(res.body.slowMoving.length).toBeLessThanOrEqual(10);
  });

  it("200: limit=0 treated as default (Math.max(0||10,1)=10)", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=0"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving.length).toBeLessThanOrEqual(10);
  });

  it("200: filters reflect the startDate and endDate query params", async () => {
    const start = "2026-01-01";
    const end = "2026-12-31";
    const res = await request(app).get(
      `/api/analytics/product-movement?startDate=${start}&endDate=${end}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.filters.startDate).toBe(start);
    expect(res.body.filters.endDate).toBe(end);
  });

  // ── Date filters ─────────────────────────────────────────────────────────
  it("200: future startDate returns empty fastMoving and slowMoving", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(
      `/api/analytics/product-movement?startDate=${future.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving).toHaveLength(0);
    expect(res.body.slowMoving).toHaveLength(0);
  });

  it("200: past endDate returns empty fastMoving and slowMoving", async () => {
    const past = new Date("2000-01-01");
    const res = await request(app).get(
      `/api/analytics/product-movement?endDate=${past.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving).toHaveLength(0);
    expect(res.body.slowMoving).toHaveLength(0);
  });

  it("200: date range covering today includes Alpha in fastMoving", async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const res = await request(app).get(
      `/api/analytics/product-movement?startDate=${start.toISOString()}&endDate=${end.toISOString()}&limit=10`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.fastMoving.length).toBeGreaterThan(0);
    const fastNames = res.body.fastMoving.map((p) => p.productName);
    expect(fastNames).toContain("Turnover Alpha");
  });

  it("200: no date filter includes all-time results and has null startDate/endDate in filters", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=10"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.filters.startDate).toBeNull();
    expect(res.body.filters.endDate).toBeNull();
    expect(res.body.fastMoving.length).toBeGreaterThan(0);
  });

  // ── Gamma never-sold edge case ────────────────────────────────────────────
  it("200: Turnover Gamma (never sold) does not appear in fastMoving or slowMoving", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=100"
    );
    const allNames = [
      ...res.body.fastMoving.map((p) => p.productName),
      ...res.body.slowMoving.map((p) => p.productName),
    ];
    expect(allNames).not.toContain("Turnover Gamma");
  });

  it("200: salesCount=1 for Alpha (sold in one transaction)", async () => {
    const res = await request(app).get(
      "/api/analytics/product-movement?limit=10"
    );
    const alpha = res.body.fastMoving.find(
      (p) => p.productName === "Turnover Alpha"
    );
    if (alpha) {
      expect(alpha.salesCount).toBe(1);
    }
  });
});
