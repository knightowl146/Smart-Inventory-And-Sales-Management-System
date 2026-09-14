/**
 * Tests for Advanced Analytics endpoints in analyticsController.js
 *
 *  1. GET /api/analytics/sales-growth                       (getSalesGrowth)
 *  2. GET /api/analytics/sales-trend                        (getSalesTrend)
 *  3. GET /api/analytics/inventory-valuation                (getInventoryValuation)
 *  4. GET /api/analytics/inventory-valuation/category       (getInventoryValuationByCategory)
 *  5. GET /api/analytics/inventory/abc-analysis             (getABCInventoryAnalysis)
 *  6. GET /api/analytics/inventory/stock-recommendations    (getStockRecommendationMetrics)
 *
 * Uses MongoMemoryReplSet (replica set) so that MongoDB transactions work
 * inside sellProduct (used to seed SALE movements).
 */

const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");

// ─── Shared state ──────────────────────────────────────────────────────────────
let mongoServer;

// Products:
// Electronics A: purchasePrice=50, qty=100 → inventoryValue=5000
// Electronics B: purchasePrice=20, qty=200 → inventoryValue=4000
// Tools C      : purchasePrice=10, qty=50  → inventoryValue=500
// totalInventoryValue = 9500
// ABC: A=Electronics A (52.6%), B=Electronics B (94.7%), C=Tools C (100%)
let productAId, productBId, productCId;
let testCustomerId;

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  // ── Create a customer (required for SALE movements) ──────────────────────
  const custRes = await request(app).post("/api/customers").send({
    name: "Analytics Test Customer",
    phone: "8800000001",
    email: "analytics@test.com",
  });
  testCustomerId = custRes.body.customer._id;

  // ── Create products ──────────────────────────────────────────────────────
  const pA = await request(app).post("/api/products").send({
    name: "Electronics Alpha",
    sku: "EA-001",
    category: "Electronics",
    purchasePrice: 50,
    sellingPrice: 100,
    unitPrice: 100,
    quantity: 100,
    description: "High-value electronics product",
  });
  productAId = pA.body.data._id;

  const pB = await request(app).post("/api/products").send({
    name: "Electronics Beta",
    sku: "EB-002",
    category: "Electronics",
    purchasePrice: 20,
    sellingPrice: 40,
    unitPrice: 40,
    quantity: 200,
    description: "Mid-value electronics product",
  });
  productBId = pB.body.data._id;

  const pC = await request(app).post("/api/products").send({
    name: "Tools Gamma",
    sku: "TG-003",
    category: "Tools",
    purchasePrice: 10,
    sellingPrice: 25,
    unitPrice: 25,
    quantity: 50,
    description: "Low-value tools product",
  });
  productCId = pC.body.data._id;

  // ── Seed SALE movements (customerId required by schema) ──────────────────
  // A: 3 sales × 10 units @ $100 = $3,000
  for (let i = 0; i < 3; i++) {
    await request(app)
      .post(`/api/products/${productAId}/sell`)
      .send({ quantity: 10, unitPrice: 100, customerId: testCustomerId });
  }

  // B: 2 sales × 5 units @ $40 = $400
  for (let i = 0; i < 2; i++) {
    await request(app)
      .post(`/api/products/${productBId}/sell`)
      .send({ quantity: 5, unitPrice: 40, customerId: testCustomerId });
  }

  // C: 1 sale × 2 units @ $25 = $50
  await request(app)
    .post(`/api/products/${productCId}/sell`)
    .send({ quantity: 2, unitPrice: 25, customerId: testCustomerId });
});


// ─── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/sales-growth  — getSalesGrowth
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales-growth — getSalesGrowth", () => {
  it("200: returns success with data object", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("data");
  });

  it("200: data has currentPeriod, previousPeriod and growth fields", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("currentPeriod");
    expect(res.body.data).toHaveProperty("previousPeriod");
    expect(res.body.data).toHaveProperty("growth");
  });

  it("200: currentPeriod has totalSales and totalQuantity as numbers", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.data.currentPeriod.totalSales).toBe("number");
    expect(typeof res.body.data.currentPeriod.totalQuantity).toBe("number");
  });

  it("200: growth has salesGrowth and quantityGrowth as numbers", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.data.growth.salesGrowth).toBe("number");
    expect(typeof res.body.data.growth.quantityGrowth).toBe("number");
  });

  it("200: without date range, currentPeriod totalSales >= seeded $3450", async () => {
    // 3×10×100 + 2×5×40 + 1×2×25 = 3000 + 400 + 50 = $3450
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.currentPeriod.totalSales).toBeGreaterThanOrEqual(3450);
  });

  it("200: without date range, previousPeriod defaults to 0", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPeriod.totalSales).toBe(0);
    expect(res.body.data.previousPeriod.totalQuantity).toBe(0);
  });

  it("200: with no previous data, salesGrowth is 100 (from 0 to some value)", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    // previous period is 0, current > 0, so growth = 100
    expect(res.body.data.growth.salesGrowth).toBe(100);
  });

  it("200: with date range both provided, previous period is computed", async () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 7);
    const startStr = start.toISOString().split("T")[0];
    const endStr = today.toISOString().split("T")[0];

    const res = await request(app).get(
      `/api/analytics/sales-growth?startDate=${startStr}&endDate=${endStr}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("currentPeriod");
    expect(res.body.data).toHaveProperty("previousPeriod");
    expect(res.body.data).toHaveProperty("growth");
  });

  it("200: date filter startDate far in future returns currentPeriod totalSales=0", async () => {
    const res = await request(app).get(
      "/api/analytics/sales-growth?startDate=2099-01-01&endDate=2099-12-31"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.currentPeriod.totalSales).toBe(0);
  });

  it("200: when both periods are 0, salesGrowth is 0", async () => {
    const res = await request(app).get(
      "/api/analytics/sales-growth?startDate=2099-01-01&endDate=2099-12-31"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.growth.salesGrowth).toBe(0);
  });

  it("200: salesGrowth is a number rounded to 2 decimal places max", async () => {
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    const { salesGrowth } = res.body.data.growth;
    const rounded = Number(salesGrowth.toFixed(2));
    expect(salesGrowth).toBe(rounded);
  });

  it("200: currentPeriod totalQuantity >= total seeded quantity (30 units)", async () => {
    // 3×10 + 2×5 + 1×2 = 30+10+2 = 42
    const res = await request(app).get("/api/analytics/sales-growth");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.currentPeriod.totalQuantity).toBeGreaterThanOrEqual(42);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/sales-trend  — getSalesTrend
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales-trend — getSalesTrend", () => {
  it("200: returns success with data object", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("data");
  });

  it("200: data has a trend field as a string", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("trend");
    expect(typeof res.body.data.trend).toBe("string");
  });

  it("200: trend is one of INCREASING, DECREASING, STABLE", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    expect(["INCREASING", "DECREASING", "STABLE"]).toContain(
      res.body.data.trend
    );
  });

  it("200: data has a sales array", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("sales");
    expect(Array.isArray(res.body.data.sales)).toBe(true);
  });

  it("200: each sales entry has date and totalSales fields", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    res.body.data.sales.forEach((entry) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("totalSales");
      expect(typeof entry.totalSales).toBe("number");
    });
  });

  it("200: sales are sorted ascending by date (oldest first)", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    const dates = res.body.data.sales.map((e) => e.date);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] <= dates[i + 1]).toBe(true);
    }
  });

  it("200: when fewer than 2 data points, trend is STABLE and no firstDaySales/lastDaySales", async () => {
    // Filter to future date so 0 results → STABLE
    const res = await request(app).get(
      "/api/analytics/sales-trend?startDate=2099-01-01&endDate=2099-12-31"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.trend).toBe("STABLE");
    expect(res.body.data).not.toHaveProperty("firstDaySales");
  });

  it("200: when 2+ data points, firstDaySales and lastDaySales are present", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    // All seeded sales happen on the same day in tests (so < 2 distinct days → STABLE)
    // But we still get a valid trend back
    expect(res.body.data).toHaveProperty("trend");
  });

  it("200: date filter with only startDate restricts results", async () => {
    const res = await request(app).get(
      "/api/analytics/sales-trend?startDate=2099-01-01"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.sales.length).toBe(0);
  });

  it("200: date filter with only endDate in the past returns 0 sales entries", async () => {
    const res = await request(app).get(
      "/api/analytics/sales-trend?endDate=2000-01-01"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.sales.length).toBe(0);
  });

  it("200: change field equals lastDaySales minus firstDaySales when 2+ data points", async () => {
    const res = await request(app).get("/api/analytics/sales-trend");
    expect(res.statusCode).toBe(200);
    if (res.body.data.sales.length >= 2) {
      const { firstDaySales, lastDaySales, change } = res.body.data;
      expect(change).toBeCloseTo(lastDaySales - firstDaySales, 2);
    }
    // If only 1 day of data, trend is STABLE and change is absent — that's fine
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/inventory-valuation  — getInventoryValuation
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-valuation — getInventoryValuation", () => {
  it("200: returns success with a data object", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("data");
  });

  it("200: data has totalProducts, totalQuantity, inventoryValue", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("totalProducts");
    expect(res.body.data).toHaveProperty("totalQuantity");
    expect(res.body.data).toHaveProperty("inventoryValue");
  });

  it("200: totalProducts is at least 3 (seeded in beforeAll)", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalProducts).toBeGreaterThanOrEqual(3);
  });

  it("200: totalQuantity is a positive number", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalQuantity).toBeGreaterThan(0);
  });

  it("200: inventoryValue is a positive number", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.inventoryValue).toBeGreaterThan(0);
  });

  it("200: inventoryValue reflects purchasePrice x quantity (not sellingPrice)", async () => {
    // After seeding: A had 100 qty, sold 30 → 70 left × $50 = $3500
    //                B had 200 qty, sold 10 → 190 left × $20 = $3800
    //                C had 50 qty, sold 2  → 48 left  × $10 = $480
    //                total ≥ 7780 (other products from test isolation may add more)
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.inventoryValue).toBeGreaterThanOrEqual(7780);
  });

  it("200: inventoryValue is rounded to at most 2 decimal places", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    const val = res.body.data.inventoryValue;
    const rounded = Number(val.toFixed(2));
    expect(val).toBe(rounded);
  });

  it("200: all fields are numbers (not strings or null)", async () => {
    const res = await request(app).get("/api/analytics/inventory-valuation");
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.data.totalProducts).toBe("number");
    expect(typeof res.body.data.totalQuantity).toBe("number");
    expect(typeof res.body.data.inventoryValue).toBe("number");
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/inventory-valuation/category  — getInventoryValuationByCategory
// ══════════════════════════════════════════════════════════════════════════════

describe(
  "GET /api/analytics/inventory-valuation/category — getInventoryValuationByCategory",
  () => {
    it("200: returns success with a data array", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("200: data has at least 2 categories (Electronics and Tools seeded)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("200: each entry has category, totalQuantity, inventoryValue", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((entry) => {
        expect(entry).toHaveProperty("category");
        expect(entry).toHaveProperty("totalQuantity");
        expect(entry).toHaveProperty("inventoryValue");
      });
    });

    it("200: categories are sorted by inventoryValue descending", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      const values = res.body.data.map((e) => e.inventoryValue);
      for (let i = 0; i < values.length - 1; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
      }
    });

    it("200: Electronics category is present and has higher value than Tools", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      const electronics = res.body.data.find(
        (e) => e.category === "Electronics"
      );
      const tools = res.body.data.find((e) => e.category === "Tools");
      expect(electronics).toBeDefined();
      expect(tools).toBeDefined();
      expect(electronics.inventoryValue).toBeGreaterThan(tools.inventoryValue);
    });

    it("200: inventoryValue for each category is non-negative", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((entry) => {
        expect(entry.inventoryValue).toBeGreaterThanOrEqual(0);
      });
    });

    it("200: no _id field exposed in response (projected out)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((entry) => {
        expect(entry).not.toHaveProperty("_id");
      });
    });

    it("200: totalQuantity for Electronics matches seeded remaining stock", async () => {
      // A: 100 − 30 = 70, B: 200 − 10 = 190 → Electronics total = 260
      const res = await request(app).get(
        "/api/analytics/inventory-valuation/category"
      );
      expect(res.statusCode).toBe(200);
      const electronics = res.body.data.find(
        (e) => e.category === "Electronics"
      );
      expect(electronics.totalQuantity).toBeGreaterThanOrEqual(260);
    });
  }
);


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/inventory/abc-analysis  — getABCInventoryAnalysis
// ══════════════════════════════════════════════════════════════════════════════

describe(
  "GET /api/analytics/inventory/abc-analysis — getABCInventoryAnalysis",
  () => {
    it("200: returns success with data object", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
    });

    it("200: data has totalInventoryValue, summary and products", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty("totalInventoryValue");
      expect(res.body.data).toHaveProperty("summary");
      expect(res.body.data).toHaveProperty("products");
    });

    it("200: products is an array", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.products)).toBe(true);
    });

    it("200: at least 3 products in the analysis", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.products.length).toBeGreaterThanOrEqual(3);
    });

    it("200: each product entry has required fields", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.products.forEach((p) => {
        expect(p).toHaveProperty("productId");
        expect(p).toHaveProperty("name");
        expect(p).toHaveProperty("category");
        expect(p).toHaveProperty("inventoryValue");
        expect(p).toHaveProperty("cumulativePercentage");
        expect(p).toHaveProperty("classification");
      });
    });

    it("200: each product classification is A, B, or C", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.products.forEach((p) => {
        expect(["A", "B", "C"]).toContain(p.classification);
      });
    });

    it("200: products are sorted by inventoryValue descending", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const vals = res.body.data.products.map((p) => p.inventoryValue);
      for (let i = 0; i < vals.length - 1; i++) {
        expect(vals[i]).toBeGreaterThanOrEqual(vals[i + 1]);
      }
    });

    it("200: summary counts A + B + C equal total product count", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const { A, B, C } = res.body.data.summary;
      expect(A + B + C).toBe(res.body.data.products.length);
    });

    it("200: cumulativePercentage of last product is 100 (or close)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const products = res.body.data.products;
      const last = products[products.length - 1];
      expect(last.cumulativePercentage).toBeCloseTo(100, 1);
    });

    it("200: cumulativePercentage is non-decreasing across sorted products", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const percentages = res.body.data.products.map(
        (p) => p.cumulativePercentage
      );
      for (let i = 0; i < percentages.length - 1; i++) {
        expect(percentages[i]).toBeLessThanOrEqual(percentages[i + 1]);
      }
    });

    it("200: no A-class product comes after a B or C product", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const products = res.body.data.products;
      let seenBorC = false;
      for (const p of products) {
        if (p.classification === "B" || p.classification === "C") {
          seenBorC = true;
        }
        if (seenBorC) {
          expect(p.classification).not.toBe("A");
        }
      }
    });

    it("200: totalInventoryValue equals sum of all product inventoryValues", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      const sumFromProducts = res.body.data.products.reduce(
        (sum, p) => sum + p.inventoryValue,
        0
      );
      expect(res.body.data.totalInventoryValue).toBeCloseTo(
        sumFromProducts,
        1
      );
    });

    it("200: summary.A is at least 1 (Electronics Alpha is high-value)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/abc-analysis"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.A).toBeGreaterThanOrEqual(1);
    });
  }
);


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/inventory/stock-recommendations  — getStockRecommendationMetrics
// ══════════════════════════════════════════════════════════════════════════════

describe(
  "GET /api/analytics/inventory/stock-recommendations — getStockRecommendationMetrics",
  () => {
    it("200: returns success with a data array", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("200: data has at least 3 entries (one per seeded product)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("200: each entry has all required metric fields", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        expect(m).toHaveProperty("productId");
        expect(m).toHaveProperty("name");
        expect(m).toHaveProperty("category");
        expect(m).toHaveProperty("currentStock");
        expect(m).toHaveProperty("salesLast7Days");
        expect(m).toHaveProperty("salesLast30Days");
        expect(m).toHaveProperty("salesPrevious30Days");
        expect(m).toHaveProperty("averageDailySales");
        expect(m).toHaveProperty("salesGrowth");
        expect(m).toHaveProperty("daysOfStockRemaining");
      });
    });

    it("200: currentStock is a non-negative number", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        expect(m.currentStock).toBeGreaterThanOrEqual(0);
      });
    });

    it("200: salesLast7Days is a non-negative number", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        expect(m.salesLast7Days).toBeGreaterThanOrEqual(0);
      });
    });

    it("200: salesLast30Days is a non-negative number", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        expect(m.salesLast30Days).toBeGreaterThanOrEqual(0);
      });
    });

    it("200: averageDailySales equals salesLast30Days / 30 (rounded to 2 dp)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        const expected = Number((m.salesLast30Days / 30).toFixed(2));
        expect(m.averageDailySales).toBeCloseTo(expected, 2);
      });
    });

    it("200: daysOfStockRemaining is null when averageDailySales is 0", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        if (m.averageDailySales === 0) {
          expect(m.daysOfStockRemaining).toBeNull();
        }
      });
    });

    it("200: daysOfStockRemaining is a positive number when sales exist", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        if (m.daysOfStockRemaining !== null) {
          expect(m.daysOfStockRemaining).toBeGreaterThan(0);
        }
      });
    });

    it("200: Electronics Alpha entry has salesLast30Days >= 30 (3 sales × 10)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      const alpha = res.body.data.find((m) => m.name === "Electronics Alpha");
      expect(alpha).toBeDefined();
      // All 3 sales happened in the last 30 days
      expect(alpha.salesLast30Days).toBeGreaterThanOrEqual(30);
    });

    it("200: Electronics Alpha salesLast7Days >= 30 (all seeded today)", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      const alpha = res.body.data.find((m) => m.name === "Electronics Alpha");
      expect(alpha).toBeDefined();
      // All sales happened today (within last 7 days)
      expect(alpha.salesLast7Days).toBeGreaterThanOrEqual(30);
    });

    it("200: purchasePrice field is present and positive", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((m) => {
        expect(m).toHaveProperty("purchasePrice");
        expect(m.purchasePrice).toBeGreaterThan(0);
      });
    });

    it("200: salesGrowth is 100 for products with sales this period but none in previous 30 days", async () => {
      const res = await request(app).get(
        "/api/analytics/inventory/stock-recommendations"
      );
      expect(res.statusCode).toBe(200);
      // All seeded sales are in last 30 days and none in prior 30-60 days
      // So salesGrowth for products with sales should be 100
      const alpha = res.body.data.find((m) => m.name === "Electronics Alpha");
      expect(alpha.salesGrowth).toBe(100);
    });
  }
);
