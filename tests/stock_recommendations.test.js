/**
 * Stock Recommendations Tests
 * 
 * Tests for single product stock recommendation endpoint:
 *  - GET /api/analytics/inventory/stock-recommendations/:productId
 * 
 * Tests cover:
 *  - Valid product recommendations
 *  - Invalid product IDs
 *  - Non-existent products
 *  - Edge cases (zero sales, low stock, etc.)
 */

const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const app = require("../app");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovements");
const Supplier = require("../models/Supplier");
const Customer = require("../models/Customer");

let mongoServer;

// ══════════════════════════════════════════════════════════════════════════════
// Setup / Teardown
// ══════════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  });

  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await seedTestUsers();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Product.deleteMany({});
  await StockMovement.deleteMany({});
  await Supplier.deleteMany({});
  await Customer.deleteMany({});
});

// ══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ══════════════════════════════════════════════════════════════════════════════

async function seedTestData() {
  // Create supplier and customer
  const supplier = await Supplier.create({
    name: "Test Supplier",
    email: "supplier@test.com",
    phone: "1234567890"
  });

  const customer = await Customer.create({
    name: "Test Customer",
    email: "customer@test.com",
    phone: "9876543210"
  });

  // Product 1: High stock, good sales
  const product1 = await Product.create({
    name: "Product High Stock",
    sku: "PROD-HIGH-001",
    category: "Electronics",
    purchasePrice: 100,
    sellingPrice: 150,
    unitPrice: 150,
    quantity: 500,
    lowStockThreshold: 50,
    description: "Product with high stock and good sales"
  });

  // Product 2: Low stock, good sales (needs reorder)
  const product2 = await Product.create({
    name: "Product Low Stock",
    sku: "PROD-LOW-002",
    category: "Electronics",
    purchasePrice: 80,
    sellingPrice: 120,
    unitPrice: 120,
    quantity: 30,
    lowStockThreshold: 50,
    description: "Product with low stock and good sales"
  });

  // Product 3: Zero stock, good historical sales
  const product3 = await Product.create({
    name: "Product Out of Stock",
    sku: "PROD-OUT-003",
    category: "Electronics",
    purchasePrice: 60,
    sellingPrice: 90,
    unitPrice: 90,
    quantity: 0,
    lowStockThreshold: 20,
    description: "Product out of stock"
  });

  // Product 4: Good stock, no sales
  const product4 = await Product.create({
    name: "Product No Sales",
    sku: "PROD-NOSALES-004",
    category: "Furniture",
    purchasePrice: 200,
    sellingPrice: 300,
    unitPrice: 300,
    quantity: 100,
    lowStockThreshold: 10,
    description: "Product with no sales history"
  });

  // Create sales for products 1, 2, 3
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const fortyFiveDaysAgo = new Date(now);
  fortyFiveDaysAgo.setDate(now.getDate() - 45);

  // Product 1 sales - recent
  for (let i = 0; i < 3; i++) {
    await StockMovement.create({
      product: product1._id,
      type: "SALE",
      quantity: 10,
      unitPrice: 150,
      customer: customer._id,
      prevQuantity: 500 + (i + 1) * 10,
      newQuantity: 500 + i * 10,
      createdAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    });
  }

  // Product 2 sales - recent and heavy
  for (let i = 0; i < 5; i++) {
    await StockMovement.create({
      product: product2._id,
      type: "SALE",
      quantity: 20,
      unitPrice: 120,
      customer: customer._id,
      prevQuantity: 30 + (i + 1) * 20,
      newQuantity: 30 + i * 20,
      createdAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    });
  }

  // Product 3 sales - historical only
  for (let i = 0; i < 2; i++) {
    await StockMovement.create({
      product: product3._id,
      type: "SALE",
      quantity: 15,
      unitPrice: 90,
      customer: customer._id,
      prevQuantity: 15 * (i + 1),
      newQuantity: 15 * i,
      createdAt: new Date(now.getTime() - (3 + i) * 24 * 60 * 60 * 1000)
    });
  }

  // Previous period sales for product 1 (for growth calculation)
  for (let i = 0; i < 2; i++) {
    await StockMovement.create({
      product: product1._id,
      type: "SALE",
      quantity: 8,
      unitPrice: 150,
      customer: customer._id,
      prevQuantity: 500 + (i + 1) * 8,
      newQuantity: 500 + i * 8,
      createdAt: fortyFiveDaysAgo
    });
  }

  return { supplier, customer, product1, product2, product3, product4 };
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/inventory/stock-recommendations/:productId
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/inventory/stock-recommendations/:productId", () => {
  
  it("400: returns error for invalid product ID", async () => {
    const res = await request(app).get(
      "/api/analytics/inventory/stock-recommendations/invalid-id"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("404: returns error for non-existent product", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${fakeId}`
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("200: returns recommendation for product with good stock and sales", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.productId).toBeDefined();
    expect(data.name).toBe("Product High Stock");
    expect(data.currentStock).toBe(500);
    expect(data.lowStockThreshold).toBe(50);
    expect(data.salesLast7Days).toBeGreaterThan(0);
    expect(data.salesLast30Days).toBeGreaterThan(0);
    expect(data.averageDailySales).toBeGreaterThan(0);
    expect(data.recommendation).toBeDefined();
    expect(data.recommendedQuantity).toBeDefined();
    expect(data.reason).toBeDefined();
  });

  it("200: returns REORDER_NOW for low stock product", async () => {
    const { product2 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product2._id}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    
    const data = res.body.data;
    expect(data.currentStock).toBe(30);
    expect(data.lowStockThreshold).toBe(50);
    expect(data.recommendation).toBe("REORDER_NOW");
    expect(data.recommendedQuantity).toBeGreaterThan(0);
  });

  it("200: returns REORDER_NOW for out of stock product", async () => {
    const { product3 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product3._id}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    
    const data = res.body.data;
    expect(data.currentStock).toBe(0);
    expect(data.recommendation).toBe("REORDER_NOW");
    expect(data.recommendedQuantity).toBeGreaterThan(0);
  });

  it("200: returns NO_SALES for product with no sales history", async () => {
    const { product4 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product4._id}`
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    
    const data = res.body.data;
    expect(data.salesLast30Days).toBe(0);
    expect(data.recommendation).toBe("NO_SALES");
    expect(data.recommendedQuantity).toBe(0);
  });

  it("200: calculates averageDailySales correctly", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    const expectedAverage = data.salesLast30Days / 30;
    expect(data.averageDailySales).toBeCloseTo(expectedAverage, 2);
  });

  it("200: calculates salesGrowth correctly", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    expect(data.salesGrowth).toBeDefined();
    expect(typeof data.salesGrowth).toBe("number");
    
    // Should have positive growth since recent sales > previous period sales
    if (data.salesPrevious30Days > 0) {
      expect(data.salesGrowth).toBeGreaterThan(0);
    }
  });

  it("200: calculates daysOfStockRemaining correctly", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    if (data.averageDailySales > 0) {
      const expectedDays = data.currentStock / data.averageDailySales;
      expect(data.daysOfStockRemaining).toBeCloseTo(expectedDays, 2);
    } else {
      expect(data.daysOfStockRemaining).toBeNull();
    }
  });

  it("200: daysOfStockRemaining is null for products with no sales", async () => {
    const { product4 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product4._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    expect(data.averageDailySales).toBe(0);
    expect(data.daysOfStockRemaining).toBeNull();
  });

  it("200: baseReorderQuantity is calculated", async () => {
    const { product2 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product2._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    expect(data.baseReorderQuantity).toBeDefined();
    expect(typeof data.baseReorderQuantity).toBe("number");
    expect(data.baseReorderQuantity).toBeGreaterThanOrEqual(0);
  });

  it("200: recommendedQuantity is 0 for HEALTHY products", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    if (data.recommendation === "HEALTHY") {
      expect(data.recommendedQuantity).toBe(0);
    }
  });

  it("200: all numeric metrics are properly formatted to 2 decimal places", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    expect(data.averageDailySales.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(data.salesGrowth.toString()).toMatch(/^-?\d+(\.\d{1,2})?$/);
    
    if (data.daysOfStockRemaining !== null) {
      expect(data.daysOfStockRemaining.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    }
  });

  it("200: reason field is always present", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    expect(data.reason).toBeDefined();
    expect(typeof data.reason).toBe("string");
    expect(data.reason.length).toBeGreaterThan(0);
  });

  it("200: recommendation is one of valid values", async () => {
    const { product1 } = await seedTestData();

    const res = await request(app).get(
      `/api/analytics/inventory/stock-recommendations/${product1._id}`
    );

    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    
    const validRecommendations = ["REORDER_NOW", "REORDER_SOON", "HEALTHY", "NO_SALES"];
    expect(validRecommendations).toContain(data.recommendation);
  });
});
