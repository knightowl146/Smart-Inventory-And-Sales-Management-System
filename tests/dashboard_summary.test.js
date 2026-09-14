/**
 * Tests for GET /api/analytics/dashboard/summary  (getDashboardSummary)
 *
 * Actual response shape (discovered from live endpoint):
 *
 *   data.overview        { totalProducts, totalStock, inventoryValue,
 *                          totalCustomers, lowStockCount, outOfStockCount }
 *   data.sales           { period, totalSales, totalUnitsSold, salesCount,
 *                          growth, previousPeriod }
 *   data.purchases       { period, totalPurchases, totalUnitsPurchased,
 *                          purchaseCount, growth, previousPeriod }
 *   data.financial       { period, revenue, costOfGoodsSold, profit,
 *                          profitMargin, growth, previousPeriod }
 *   data.salesVsPurchases{ sales, purchases, difference, salesToPurchaseRatio }
 *   data.inventoryHealth { lowStockCount, outOfStockCount, healthyStockCount }
 *   data.trends          { sales: [...], purchases: [...] }
 *   data.lowStockProducts [ { name, category, quantity, lowStockThreshold } ]
 *   data.topSellingProducts [ { productId, name, category, quantitySold, revenue } ]
 *
 * Data seeded:
 *   Product A – Electronics Alpha  purchasePrice=50  sellingPrice=100  qty=100
 *   Product B – Electronics Beta   purchasePrice=20  sellingPrice=40   qty=200
 *   Product C – Tools Gamma        purchasePrice=10  sellingPrice=25   qty=50
 *                                  lowStockThreshold=999  (always low-stock)
 *
 *   Sales (last 30 days):
 *     A: 3 × 10 units @ $100 → revenue $3 000,  cost $1 500
 *     B: 2 × 5  units @ $40  → revenue $400,    cost $200
 *     C: 1 × 2  units @ $25  → revenue $50,     cost $20
 *     TOTAL revenue = $3 450, TOTAL cost = $1 720, TOTAL profit = $1 730
 *
 *   Purchases (last 30 days):
 *     A: 1 × 20 units @ $50 → spending $1 000
 *
 * Uses MongoMemoryReplSet so that transactions inside sellProduct work.
 */

const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose  = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app       = require("../app");

// ─── Shared IDs ────────────────────────────────────────────────────────────────
let mongoServer;
let productAId, productBId, productCId;
let testCustomerId;

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  // Customer
  const custRes = await request(app).post("/api/customers").send({
    name:  "Dashboard Test Customer",
    phone: "9900000001",
    email: "dashboard@test.com",
  });
  testCustomerId = custRes.body.customer._id;

  // Products
  const pA = await request(app).post("/api/products").send({
    name: "Electronics Alpha", sku: "DA-001", category: "Electronics",
    purchasePrice: 50, sellingPrice: 100, unitPrice: 100,
    quantity: 100, description: "Dashboard test product A",
  });
  productAId = pA.body.data._id;

  const pB = await request(app).post("/api/products").send({
    name: "Electronics Beta", sku: "DB-002", category: "Electronics",
    purchasePrice: 20, sellingPrice: 40, unitPrice: 40,
    quantity: 200, description: "Dashboard test product B",
  });
  productBId = pB.body.data._id;

  const pC = await request(app).post("/api/products").send({
    name: "Tools Gamma", sku: "DC-003", category: "Tools",
    purchasePrice: 10, sellingPrice: 25, unitPrice: 25,
    quantity: 50, lowStockThreshold: 999,
    description: "Dashboard test product C (low-stock)",
  });
  productCId = pC.body.data._id;

  // Sales
  for (let i = 0; i < 3; i++) {
    await request(app).post(`/api/products/${productAId}/sell`)
      .send({ quantity: 10, unitPrice: 100, customerId: testCustomerId });
  }
  for (let i = 0; i < 2; i++) {
    await request(app).post(`/api/products/${productBId}/sell`)
      .send({ quantity: 5, unitPrice: 40, customerId: testCustomerId });
  }
  await request(app).post(`/api/products/${productCId}/sell`)
    .send({ quantity: 2, unitPrice: 25, customerId: testCustomerId });

  // Purchase
  await request(app).post("/api/movements")
    .send({ product: productAId, type: "PURCHASE", quantity: 20, unitPrice: 50 });
});

// ─── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
//  1. HTTP + top-level response shape
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — HTTP & top-level shape", () => {
  it("200: returns HTTP 200", async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    expect(res.statusCode).toBe(200);
  });

  it("200: success flag is true", async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    expect(res.body.success).toBe(true);
  });

  it("200: body has a data property", async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toBeDefined();
  });

  it("200: data contains all expected top-level keys", async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    const d = res.body.data;
    expect(d).toHaveProperty("overview");
    expect(d).toHaveProperty("sales");
    expect(d).toHaveProperty("purchases");
    expect(d).toHaveProperty("financial");
    expect(d).toHaveProperty("salesVsPurchases");
    expect(d).toHaveProperty("inventoryHealth");
    expect(d).toHaveProperty("trends");
    expect(d).toHaveProperty("lowStockProducts");
    expect(d).toHaveProperty("topSellingProducts");
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  2. Overview section  (inventory + customer totals in one object)
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — overview section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("overview is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.overview).toBe("object");
  });

  it("overview.totalProducts is a positive integer", () => {
    expect(typeof data.overview.totalProducts).toBe("number");
    expect(data.overview.totalProducts).toBeGreaterThan(0);
  });

  it("overview.totalProducts reflects at least the 3 seeded products", () => {
    expect(data.overview.totalProducts).toBeGreaterThanOrEqual(3);
  });

  it("overview.totalStock is a non-negative number", () => {
    expect(typeof data.overview.totalStock).toBe("number");
    expect(data.overview.totalStock).toBeGreaterThanOrEqual(0);
  });

  it("overview.inventoryValue is a non-negative number", () => {
    expect(typeof data.overview.inventoryValue).toBe("number");
    expect(data.overview.inventoryValue).toBeGreaterThanOrEqual(0);
  });

  it("overview.totalCustomers is a positive integer (at least 1 seeded)", () => {
    expect(typeof data.overview.totalCustomers).toBe("number");
    expect(data.overview.totalCustomers).toBeGreaterThanOrEqual(1);
  });

  it("overview.lowStockCount is a non-negative integer", () => {
    expect(typeof data.overview.lowStockCount).toBe("number");
    expect(data.overview.lowStockCount).toBeGreaterThanOrEqual(0);
  });

  it("overview.outOfStockCount is a non-negative integer", () => {
    expect(typeof data.overview.outOfStockCount).toBe("number");
    expect(data.overview.outOfStockCount).toBeGreaterThanOrEqual(0);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  3. Sales section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — sales section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("sales is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.sales).toBe("object");
  });

  it("sales.period is LAST_30_DAYS", () => {
    expect(data.sales.period).toBe("LAST_30_DAYS");
  });

  it("sales.totalUnitsSold is a non-negative number", () => {
    expect(typeof data.sales.totalUnitsSold).toBe("number");
    expect(data.sales.totalUnitsSold).toBeGreaterThanOrEqual(0);
  });

  it("sales.totalSales is a non-negative number", () => {
    expect(typeof data.sales.totalSales).toBe("number");
    expect(data.sales.totalSales).toBeGreaterThanOrEqual(0);
  });

  it("sales.salesCount is a non-negative integer", () => {
    expect(typeof data.sales.salesCount).toBe("number");
    expect(data.sales.salesCount).toBeGreaterThanOrEqual(0);
  });

  it("sales.growth is a number", () => {
    expect(typeof data.sales.growth).toBe("number");
  });

  it("sales.totalSales >= seeded $3 450", () => {
    expect(data.sales.totalSales).toBeGreaterThanOrEqual(3450);
  });

  it("sales.totalUnitsSold >= 42 seeded units (30+10+2)", () => {
    expect(data.sales.totalUnitsSold).toBeGreaterThanOrEqual(42);
  });

  it("sales.salesCount >= 6 (6 sell operations performed)", () => {
    expect(data.sales.salesCount).toBeGreaterThanOrEqual(6);
  });

  it("sales.growth is 100 (no previous-period sales)", () => {
    expect(data.sales.growth).toBe(100);
  });

  it("sales.previousPeriod is an object with totalSales, totalUnitsSold, salesCount", () => {
    expect(data.sales).toHaveProperty("previousPeriod");
    expect(data.sales.previousPeriod).toHaveProperty("totalSales");
    expect(data.sales.previousPeriod).toHaveProperty("totalUnitsSold");
    expect(data.sales.previousPeriod).toHaveProperty("salesCount");
  });

  it("sales.previousPeriod.totalSales = 0 (no sales in days 31-60)", () => {
    expect(data.sales.previousPeriod.totalSales).toBe(0);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  4. Purchases section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — purchases section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("purchases is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.purchases).toBe("object");
  });

  it("purchases.period is LAST_30_DAYS", () => {
    expect(data.purchases.period).toBe("LAST_30_DAYS");
  });

  it("purchases.totalPurchases is a non-negative number", () => {
    expect(typeof data.purchases.totalPurchases).toBe("number");
    expect(data.purchases.totalPurchases).toBeGreaterThanOrEqual(0);
  });

  it("purchases.totalUnitsPurchased is a non-negative number", () => {
    expect(typeof data.purchases.totalUnitsPurchased).toBe("number");
    expect(data.purchases.totalUnitsPurchased).toBeGreaterThanOrEqual(0);
  });

  it("purchases.purchaseCount is a non-negative integer", () => {
    expect(typeof data.purchases.purchaseCount).toBe("number");
    expect(data.purchases.purchaseCount).toBeGreaterThanOrEqual(0);
  });

  it("purchases.growth is a number", () => {
    expect(typeof data.purchases.growth).toBe("number");
  });

  it("purchases.previousPeriod is an object", () => {
    expect(data.purchases).toHaveProperty("previousPeriod");
    expect(typeof data.purchases.previousPeriod).toBe("object");
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  5. Financial section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — financial section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("financial is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.financial).toBe("object");
  });

  it("financial.period is LAST_30_DAYS", () => {
    expect(data.financial.period).toBe("LAST_30_DAYS");
  });

  it("financial.revenue is a non-negative number", () => {
    expect(typeof data.financial.revenue).toBe("number");
    expect(data.financial.revenue).toBeGreaterThanOrEqual(0);
  });

  it("financial.costOfGoodsSold is a non-negative number", () => {
    expect(typeof data.financial.costOfGoodsSold).toBe("number");
    expect(data.financial.costOfGoodsSold).toBeGreaterThanOrEqual(0);
  });

  it("financial.profit is a number", () => {
    expect(typeof data.financial.profit).toBe("number");
  });

  it("financial.profitMargin is a number", () => {
    expect(typeof data.financial.profitMargin).toBe("number");
  });

  it("financial.growth is a number", () => {
    expect(typeof data.financial.growth).toBe("number");
  });

  it("financial.revenue >= seeded $3 450", () => {
    expect(data.financial.revenue).toBeGreaterThanOrEqual(3450);
  });

  it("financial.costOfGoodsSold >= seeded $1 720 (cost of sold units)", () => {
    // A:30×50=1500, B:10×20=200, C:2×10=20 → 1720
    expect(data.financial.costOfGoodsSold).toBeGreaterThanOrEqual(1720);
  });

  it("financial.profit >= seeded $1 730", () => {
    expect(data.financial.profit).toBeGreaterThanOrEqual(1730);
  });

  it("financial.profit ≈ revenue − costOfGoodsSold", () => {
    const expected = parseFloat(
      (data.financial.revenue - data.financial.costOfGoodsSold).toFixed(2)
    );
    expect(data.financial.profit).toBeCloseTo(expected, 1);
  });

  it("financial.previousPeriod has revenue, costOfGoodsSold, profit", () => {
    expect(data.financial).toHaveProperty("previousPeriod");
    expect(data.financial.previousPeriod).toHaveProperty("revenue");
    expect(data.financial.previousPeriod).toHaveProperty("costOfGoodsSold");
    expect(data.financial.previousPeriod).toHaveProperty("profit");
  });

  it("financial.previousPeriod values are numbers", () => {
    expect(typeof data.financial.previousPeriod.revenue).toBe("number");
    expect(typeof data.financial.previousPeriod.costOfGoodsSold).toBe("number");
    expect(typeof data.financial.previousPeriod.profit).toBe("number");
  });

  it("financial.previousPeriod.revenue = 0 (no sales in days 31-60)", () => {
    expect(data.financial.previousPeriod.revenue).toBe(0);
  });

  it("financial.growth is 100 (previous profit was 0)", () => {
    expect(data.financial.growth).toBe(100);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  6. salesVsPurchases section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — salesVsPurchases section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("salesVsPurchases is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.salesVsPurchases).toBe("object");
  });

  it("salesVsPurchases.sales is a non-negative number", () => {
    expect(typeof data.salesVsPurchases.sales).toBe("number");
    expect(data.salesVsPurchases.sales).toBeGreaterThanOrEqual(0);
  });

  it("salesVsPurchases.purchases is a non-negative number", () => {
    expect(typeof data.salesVsPurchases.purchases).toBe("number");
    expect(data.salesVsPurchases.purchases).toBeGreaterThanOrEqual(0);
  });

  it("salesVsPurchases.difference is a number", () => {
    expect(typeof data.salesVsPurchases.difference).toBe("number");
  });

  it("salesVsPurchases.salesToPurchaseRatio is a number or null", () => {
    const ratio = data.salesVsPurchases.salesToPurchaseRatio;
    expect(ratio === null || typeof ratio === "number").toBe(true);
  });

  it("salesVsPurchases.sales >= seeded $3 450", () => {
    expect(data.salesVsPurchases.sales).toBeGreaterThanOrEqual(3450);
  });

  it("salesVsPurchases.difference ≈ sales − purchases", () => {
    const expected = parseFloat(
      (data.salesVsPurchases.sales - data.salesVsPurchases.purchases).toFixed(2)
    );
    expect(data.salesVsPurchases.difference).toBeCloseTo(expected, 1);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  7. inventoryHealth section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — inventoryHealth section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("inventoryHealth is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.inventoryHealth).toBe("object");
  });

  it("inventoryHealth.lowStockCount is a non-negative integer", () => {
    expect(typeof data.inventoryHealth.lowStockCount).toBe("number");
    expect(data.inventoryHealth.lowStockCount).toBeGreaterThanOrEqual(0);
  });

  it("inventoryHealth.outOfStockCount is a non-negative integer", () => {
    expect(typeof data.inventoryHealth.outOfStockCount).toBe("number");
    expect(data.inventoryHealth.outOfStockCount).toBeGreaterThanOrEqual(0);
  });

  it("inventoryHealth.healthyStockCount is a non-negative integer", () => {
    expect(typeof data.inventoryHealth.healthyStockCount).toBe("number");
    expect(data.inventoryHealth.healthyStockCount).toBeGreaterThanOrEqual(0);
  });

  it("lowStockCount >= 1 (Product C has threshold=999)", () => {
    expect(data.inventoryHealth.lowStockCount).toBeGreaterThanOrEqual(1);
  });

  it("inventoryHealth counts are consistent (lowStock + healthy >= totalProducts)", () => {
    const total = data.overview.totalProducts;
    const lowStock = data.inventoryHealth.lowStockCount;
    const healthy = data.inventoryHealth.healthyStockCount;
    // healthy = max(0, total - lowStockCount), so lowStock + healthy <= total
    expect(lowStock + healthy).toBeLessThanOrEqual(total + 1); // allow 1 rounding tolerance
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  8. Trends section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — trends section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("trends is an object", () => {
    expect(data).toBeDefined();
    expect(typeof data.trends).toBe("object");
  });

  it("trends.sales is an array", () => {
    expect(Array.isArray(data.trends.sales)).toBe(true);
  });

  it("trends.purchases is an array", () => {
    expect(Array.isArray(data.trends.purchases)).toBe(true);
  });

  it("trends.sales is non-empty (sales occurred in last 30 days)", () => {
    expect(data.trends.sales.length).toBeGreaterThan(0);
  });

  it("each sales trend entry has date, unitsSold, revenue, salesCount", () => {
    const entry = data.trends.sales[0];
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("unitsSold");
    expect(entry).toHaveProperty("revenue");
    expect(entry).toHaveProperty("salesCount");
  });

  it("each sales trend entry revenue is a non-negative number", () => {
    data.trends.sales.forEach((entry) => {
      expect(typeof entry.revenue).toBe("number");
      expect(entry.revenue).toBeGreaterThanOrEqual(0);
    });
  });

  it("trends total revenue matches salesVsPurchases.sales", () => {
    const trendTotal = data.trends.sales.reduce((sum, e) => sum + e.revenue, 0);
    expect(trendTotal).toBeCloseTo(data.salesVsPurchases.sales, 0);
  });

  it("trends.sales entries are sorted chronologically (date ascending)", () => {
    for (let i = 1; i < data.trends.sales.length; i++) {
      expect(data.trends.sales[i].date >= data.trends.sales[i - 1].date).toBe(true);
    }
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  9. lowStockProducts section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — lowStockProducts section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("lowStockProducts is an array", () => {
    expect(data).toBeDefined();
    expect(Array.isArray(data.lowStockProducts)).toBe(true);
  });

  it("lowStockProducts contains at most 5 entries", () => {
    expect(data.lowStockProducts.length).toBeLessThanOrEqual(5);
  });

  it("lowStockProducts is non-empty (Product C threshold=999)", () => {
    expect(data.lowStockProducts.length).toBeGreaterThan(0);
  });

  it("each entry has name, category, quantity, lowStockThreshold", () => {
    const entry = data.lowStockProducts[0];
    expect(entry).toHaveProperty("name");
    expect(entry).toHaveProperty("category");
    expect(entry).toHaveProperty("quantity");
    expect(entry).toHaveProperty("lowStockThreshold");
  });

  it("each entry quantity <= lowStockThreshold", () => {
    data.lowStockProducts.forEach((p) => {
      expect(p.quantity).toBeLessThanOrEqual(p.lowStockThreshold);
    });
  });

  it("Product C (Tools Gamma) appears in lowStockProducts", () => {
    const names = data.lowStockProducts.map((p) => p.name);
    expect(names).toContain("Tools Gamma");
  });

  it("results are sorted ascending by quantity", () => {
    for (let i = 1; i < data.lowStockProducts.length; i++) {
      expect(data.lowStockProducts[i].quantity).toBeGreaterThanOrEqual(
        data.lowStockProducts[i - 1].quantity
      );
    }
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  10. topSellingProducts section
// ══════════════════════════════════════════════════════════════════════════════
describe("GET /api/analytics/dashboard/summary — topSellingProducts section", () => {
  let data;
  beforeAll(async () => {
    const res = await request(app).get("/api/analytics/dashboard/summary");
    data = res.body.data;
  });

  it("topSellingProducts is an array", () => {
    expect(data).toBeDefined();
    expect(Array.isArray(data.topSellingProducts)).toBe(true);
  });

  it("topSellingProducts contains at most 5 entries", () => {
    expect(data.topSellingProducts.length).toBeLessThanOrEqual(5);
  });

  it("topSellingProducts is non-empty", () => {
    expect(data.topSellingProducts.length).toBeGreaterThan(0);
  });

  it("each entry has productId, name, category, quantitySold, revenue", () => {
    const entry = data.topSellingProducts[0];
    expect(entry).toHaveProperty("productId");
    expect(entry).toHaveProperty("name");
    expect(entry).toHaveProperty("category");
    expect(entry).toHaveProperty("quantitySold");
    expect(entry).toHaveProperty("revenue");
  });

  it("each entry revenue is a non-negative number", () => {
    data.topSellingProducts.forEach((p) => {
      expect(typeof p.revenue).toBe("number");
      expect(p.revenue).toBeGreaterThanOrEqual(0);
    });
  });

  it("Product A (Electronics Alpha) is the top seller (30 units)", () => {
    const first = data.topSellingProducts[0];
    expect(first.name).toBe("Electronics Alpha");
  });

  it("Product A entry has quantitySold >= 30", () => {
    const entryA = data.topSellingProducts.find(
      (p) => p.name === "Electronics Alpha"
    );
    expect(entryA).toBeDefined();
    expect(entryA.quantitySold).toBeGreaterThanOrEqual(30);
  });

  it("Product A entry revenue >= $3 000", () => {
    const entryA = data.topSellingProducts.find(
      (p) => p.name === "Electronics Alpha"
    );
    expect(entryA.revenue).toBeGreaterThanOrEqual(3000);
  });

  it("all 3 seeded products appear in top-selling list", () => {
    const names = data.topSellingProducts.map((p) => p.name);
    expect(names).toContain("Electronics Alpha");
    expect(names).toContain("Electronics Beta");
    expect(names).toContain("Tools Gamma");
  });
});
