const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");

let mongoServer;
let productAId, productBId, productCId;
let testSupplierId;
let testCustomerId;

// ─── Setup & Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  // Create a test supplier for purchase movements
  const supplierRes = await request(app).post("/api/suppliers").send({
    name: "Analytics Test Supplier",
    email: "analytics@supplier.com",
    phone: "8888888888"
  });
  testSupplierId = supplierRes.body.data._id;

  const customerRes = await request(app).post("/api/customers").send({
    name: "Analytics Test Customer",
    email: "analytics@customer.com",
    phone: "7777777777"
  });
  testCustomerId = customerRes.body.customer._id;


  // Create 3 products
  const pA = await request(app).post("/api/products").send({
    name: "Alpha Widget",
    sku: "AW-001",
    category: "Electronics",
    purchasePrice: 30,
    sellingPrice: 60,
    unitPrice: 60,
    quantity: 200,
    description: "Alpha product",
  });
  productAId = pA.body.data._id;

  const pB = await request(app).post("/api/products").send({
    name: "Beta Gadget",
    sku: "BG-002",
    category: "Electronics",
    purchasePrice: 20,
    sellingPrice: 40,
    unitPrice: 40,
    quantity: 200,
    description: "Beta product",
  });
  productBId = pB.body.data._id;

  const pC = await request(app).post("/api/products").send({
    name: "Gamma Tool",
    sku: "GT-003",
    category: "Tools",
    purchasePrice: 10,
    sellingPrice: 25,
    unitPrice: 25,
    quantity: 200,
    description: "Gamma product",
  });
  productCId = pC.body.data._id;

  // Sell: A=30, B=20, C=10 units  →  A is top seller
  await request(app).post(`/api/products/${productAId}/sell`).send({ quantity: 30, unitPrice: 60, customerId: testCustomerId });
  await request(app).post(`/api/products/${productBId}/sell`).send({ quantity: 20, unitPrice: 40, customerId: testCustomerId });
  await request(app).post(`/api/products/${productCId}/sell`).send({ quantity: 10, unitPrice: 25, customerId: testCustomerId });

  // Also do a purchase for analytics endpoints (supplierId required)
  await request(app).post(`/api/products/${productAId}/purchase`).send({ quantity: 50, unitPrice: 30, supplierId: testSupplierId });
  await request(app).post(`/api/products/${productBId}/purchase`).send({ quantity: 25, unitPrice: 20, supplierId: testSupplierId });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
// TOP SELLING PRODUCTS  — /api/analytics/top-selling-products
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/top-selling-products", () => {
  it("200: returns top-selling products sorted by quantity sold desc", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("count");
  });

  it("200: Alpha Widget (30 units) ranks above Beta Gadget (20 units)", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products?limit=3");
    expect(res.statusCode).toBe(200);
    const names = res.body.data.map((d) => d.product.name);
    expect(names[0]).toBe("Alpha Widget");
    expect(names[1]).toBe("Beta Gadget");
    expect(names[2]).toBe("Gamma Tool");
  });

  it("200: each result has product._id, product.name, quantitySold, revenue, salesCount", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((item) => {
      expect(item).toHaveProperty("product");
      expect(item.product).toHaveProperty("_id");
      expect(item.product).toHaveProperty("name");
      expect(item).toHaveProperty("quantitySold");
      expect(item).toHaveProperty("revenue");
      expect(item).toHaveProperty("salesCount");
    });
  });

  it("200: revenue = quantitySold x sellingPrice for Alpha Widget", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products?limit=3");
    expect(res.statusCode).toBe(200);
    const alpha = res.body.data.find((d) => d.product.name === "Alpha Widget");
    expect(alpha).toBeDefined();
    expect(alpha.quantitySold).toBe(30);
    expect(alpha.revenue).toBe(30 * 60); // 1800
  });

  it("200: respects limit=1 — returns only 1 product", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products?limit=1");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].product.name).toBe("Alpha Widget");
  });

  it("200: clamps limit=999 to max 100", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products?limit=999");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  it("200: limit=0 falls back to default of 5 (falsy coercion)", async () => {
    const res = await request(app).get("/api/analytics/top-selling-products?limit=0");
    expect(res.statusCode).toBe(200);
    // parseInt("0") || 5 == 5, so defaults to 5; we have 3 products so get all 3
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("200: future startDate returns empty data", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(
      `/api/analytics/top-selling-products?startDate=${future.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("200: past endDate returns empty data", async () => {
    const past = new Date("2000-01-01");
    const res = await request(app).get(
      `/api/analytics/top-selling-products?endDate=${past.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("200: date range covering today includes results", async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const res = await request(app).get(
      `/api/analytics/top-selling-products?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SALES ANALYTICS  — /api/analytics/sales
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales", () => {
  it("200: returns totalUnitsSold and totalRevenue", async () => {
    const res = await request(app).get("/api/analytics/sales");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("totalUnitsSold");
    expect(res.body.data).toHaveProperty("totalRevenue");
  });

  it("200: totalUnitsSold is 60 (30+20+10)", async () => {
    const res = await request(app).get("/api/analytics/sales");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalUnitsSold).toBe(60);
  });

  it("200: returns salesOverTime array", async () => {
    const res = await request(app).get("/api/analytics/sales");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.salesOverTime)).toBe(true);
  });

  it("200: future startDate returns zero totals", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(`/api/analytics/sales?startDate=${future.toISOString()}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalUnitsSold).toBe(0);
    expect(res.body.data.totalRevenue).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ANALYTICS  — /api/analytics/purchases
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/purchases", () => {
  it("200: returns totalUnitsPurchased and totalPurchaseCost", async () => {
    const res = await request(app).get("/api/analytics/purchases");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("totalUnitsPurchased");
    expect(res.body.data).toHaveProperty("totalPurchaseCost");
  });

  it("200: totalUnitsPurchased includes explicit purchases (50+25 = 75 min)", async () => {
    const res = await request(app).get("/api/analytics/purchases");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalUnitsPurchased).toBeGreaterThanOrEqual(75);
  });

  it("200: returns purchaseOverTime array", async () => {
    const res = await request(app).get("/api/analytics/purchases");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.purchaseOverTime)).toBe(true);
  });

  it("200: future startDate returns zero totals", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app).get(`/api/analytics/purchases?startDate=${future.toISOString()}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalUnitsPurchased).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SALES OVER TIME  — /api/analytics/sales-over-time
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales-over-time", () => {
  it("200: returns an array of date-grouped sales", async () => {
    const res = await request(app).get("/api/analytics/sales-over-time");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has date, unitsSold, revenue", async () => {
    const res = await request(app).get("/api/analytics/sales-over-time");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("unitsSold");
      expect(entry).toHaveProperty("revenue");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASES OVER TIME  — /api/analytics/purchases-over-time
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/purchases-over-time", () => {
  it("200: returns an array of date-grouped purchases", async () => {
    const res = await request(app).get("/api/analytics/purchases-over-time");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has date, unitsPurchased, totalPurchaseCost", async () => {
    const res = await request(app).get("/api/analytics/purchases-over-time");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("unitsPurchased");
      expect(entry).toHaveProperty("totalPurchaseCost");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SALES VS PURCHASES — /api/analytics/sales-vs-purchases
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales-vs-purchases", () => {
  it("200: returns array comparing sales vs purchases grouped by date", async () => {
    const res = await request(app).get("/api/analytics/sales-vs-purchases");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has date, sales, purchases, salesRevenue, purchaseCost", async () => {
    const res = await request(app).get("/api/analytics/sales-vs-purchases");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("sales");
      expect(entry).toHaveProperty("purchases");
      expect(entry).toHaveProperty("salesRevenue");
      expect(entry).toHaveProperty("purchaseCost");
    });
  });

  it("200: accepts startDate and endDate filters without throwing", async () => {
    const start = "2026-08-01";
    const end = "2026-08-30";
    const res = await request(app).get(`/api/analytics/sales-vs-purchases?startDate=${start}&endDate=${end}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SALES BY CATEGORY — /api/analytics/sales-by-category
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/sales-by-category", () => {
  it("200: returns array of sales breakdown grouped by category", async () => {
    const res = await request(app).get("/api/analytics/sales-by-category");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has category, quantitySold, revenue, salesCount", async () => {
    const res = await request(app).get("/api/analytics/sales-by-category");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("category");
      expect(entry).toHaveProperty("quantitySold");
      expect(entry).toHaveProperty("revenue");
      expect(entry).toHaveProperty("salesCount");
    });
  });

  it("200: Electronics category correctly aggregates Alpha Widget & Beta Gadget sales", async () => {
    const res = await request(app).get("/api/analytics/sales-by-category");
    expect(res.statusCode).toBe(200);
    const electronics = res.body.data.find((c) => c.category === "Electronics");
    expect(electronics).toBeDefined();
    expect(electronics.quantitySold).toBe(50); // 30 (Alpha) + 20 (Beta)
    expect(electronics.revenue).toBe(30 * 60 + 20 * 40); // 1800 + 800 = 2600
  });

  it("200: supports date filtering with startDate and endDate", async () => {
    const start = "2026-08-01";
    const end = "2026-08-30";
    const res = await request(app).get(`/api/analytics/sales-by-category?startDate=${start}&endDate=${end}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASES BY CATEGORY — /api/analytics/purchases-by-category
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/purchases-by-category", () => {
  it("200: returns array of purchase breakdown grouped by category", async () => {
    const res = await request(app).get("/api/analytics/purchases-by-category");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has category, quantityPurchased, purchaseCost, purchaseCount", async () => {
    const res = await request(app).get("/api/analytics/purchases-by-category");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("category");
      expect(entry).toHaveProperty("quantityPurchased");
      expect(entry).toHaveProperty("purchaseCost");
      expect(entry).toHaveProperty("purchaseCount");
    });
  });

  it("200: supports date filtering with startDate and endDate", async () => {
    const start = "2026-08-01";
    const end = "2026-08-30";
    const res = await request(app).get(`/api/analytics/purchases-by-category?startDate=${start}&endDate=${end}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY BY CATEGORY — /api/analytics/inventory-by-category
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-by-category", () => {
  it("200: returns array of current inventory grouped by category", async () => {
    const res = await request(app).get("/api/analytics/inventory-by-category");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: each entry has category, quantity, inventoryValue", async () => {
    const res = await request(app).get("/api/analytics/inventory-by-category");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((entry) => {
      expect(entry).toHaveProperty("category");
      expect(entry).toHaveProperty("quantity");
      expect(entry).toHaveProperty("inventoryValue");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY HEALTH — /api/analytics/inventory-health
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-health", () => {
  it("200: returns breakdown of inventory health metrics", async () => {
    const res = await request(app).get("/api/analytics/inventory-health");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("totalProducts");
    expect(res.body.data).toHaveProperty("totalQuantity");
    expect(res.body.data).toHaveProperty("lowStockProducts");
    expect(res.body.data).toHaveProperty("outOfStockProducts");
    expect(res.body.data).toHaveProperty("healthyStockProducts");
    expect(res.body.data).toHaveProperty("inventoryValue");
  });

  it("200: healthyStockProducts equals totalProducts - (lowStockProducts + outOfStockProducts)", async () => {
    const res = await request(app).get("/api/analytics/inventory-health");
    expect(res.statusCode).toBe(200);
    const d = res.body.data;
    expect(d.healthyStockProducts).toBe(d.totalProducts - (d.lowStockProducts + d.outOfStockProducts));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT ANALYTICS — /api/analytics/products/:productId
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/products/:productId", () => {
  it("200: returns analytics for a specific product", async () => {
    const res = await request(app).get(`/api/analytics/products/${productAId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it("400: returns error for invalid product ID", async () => {
    const res = await request(app).get("/api/analytics/products/invalidId");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PROFIT & LOSS — /api/analytics/profit-loss
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/profit-loss", () => {
  it("200: returns overall profit and loss", async () => {
    const res = await request(app).get("/api/analytics/profit-loss");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PROFIT & LOSS OVER TIME — /api/analytics/profit-loss-over-time
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/profit-loss-over-time", () => {
  it("200: returns profit and loss over time", async () => {
    const res = await request(app).get("/api/analytics/profit-loss-over-time?period=monthly");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PROFIT & LOSS BY PRODUCT — /api/analytics/profit-loss/products
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/profit-loss/products", () => {
  it("200: returns profit and loss broken down by product", async () => {
    const res = await request(app).get("/api/analytics/profit-loss/products");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY ALERTS — /api/analytics/inventory-alerts
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-alerts", () => {
  it("200: returns inventory alerts", async () => {
    const res = await request(app).get("/api/analytics/inventory-alerts");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY TURNOVER — /api/analytics/inventory-turnover
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory-turnover", () => {
  it("200: returns inventory turnover metrics", async () => {
    const res = await request(app).get("/api/analytics/inventory-turnover");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
