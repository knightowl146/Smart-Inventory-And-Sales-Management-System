/**
 * Reports Tests
 * 
 * Tests for report endpoints:
 *  - GET /api/reports/sales
 *  - GET /api/reports/purchases
 *  - GET /api/reports/inventory
 *  - GET /api/reports/profit-loss
 *  - GET /api/reports/suppliers
 *  - GET /api/reports/customers
 * 
 * Tests cover:
 *  - Successful report generation
 *  - Date filtering
 *  - Invalid date formats
 *  - Invalid IDs
 *  - Empty datasets
 *  - Data structure validation
 */

const request = require("supertest");
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

  // Create products
  const product1 = await Product.create({
    name: "Electronics Alpha",
    sku: "ELEC-001",
    category: "Electronics",
    purchasePrice: 100,
    sellingPrice: 150,
    unitPrice: 150,
    quantity: 50,
    lowStockThreshold: 10,
    description: "Test product 1"
  });

  const product2 = await Product.create({
    name: "Furniture Beta",
    sku: "FURN-002",
    category: "Furniture",
    purchasePrice: 200,
    sellingPrice: 300,
    unitPrice: 300,
    quantity: 30,
    lowStockThreshold: 5,
    description: "Test product 2"
  });

  // Create purchases
  await StockMovement.create({
    product: product1._id,
    type: "PURCHASE",
    quantity: 20,
    unitPrice: 100,
    supplier: supplier._id,
    prevQuantity: 30,
    newQuantity: 50,
    createdAt: new Date()
  });

  await StockMovement.create({
    product: product2._id,
    type: "PURCHASE",
    quantity: 10,
    unitPrice: 200,
    supplier: supplier._id,
    prevQuantity: 20,
    newQuantity: 30,
    createdAt: new Date()
  });

  // Create sales
  await StockMovement.create({
    product: product1._id,
    type: "SALE",
    quantity: 5,
    unitPrice: 150,
    customer: customer._id,
    prevQuantity: 50,
    newQuantity: 45,
    createdAt: new Date()
  });

  await StockMovement.create({
    product: product2._id,
    type: "SALE",
    quantity: 3,
    unitPrice: 300,
    customer: customer._id,
    prevQuantity: 30,
    newQuantity: 27,
    createdAt: new Date()
  });

  return { supplier, customer, product1, product2 };
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/sales
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/sales", () => {
  
  it("200: returns sales report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/sales");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.period).toBeDefined();
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.salesByProduct).toBeDefined();
    expect(res.body.data.salesByCategory).toBeDefined();
    expect(res.body.data.salesOverTime).toBeDefined();
    expect(res.body.data.topCustomers).toBeDefined();
  });

  it("200: summary has correct sales calculations", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/sales");

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    
    expect(summary.totalTransactions).toBe(2); // 2 sales
    expect(summary.totalUnitsSold).toBe(8); // 5 + 3
    expect(summary.totalRevenue).toBe(1650); // (5*150) + (3*300)
  });

  it("200: salesByCategory groups correctly", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/sales");

    expect(res.statusCode).toBe(200);
    const byCategory = res.body.data.salesByCategory;
    
    expect(Array.isArray(byCategory)).toBe(true);
    expect(byCategory.length).toBeGreaterThan(0);
    
    const electronics = byCategory.find(c => c.category === "Electronics");
    expect(electronics).toBeDefined();
    expect(electronics.unitsSold).toBe(5);
  });

  it("200: filters by date range", async () => {
    await seedTestData();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const res = await request(app).get(
      `/api/reports/sales?startDate=${tomorrowStr}`
    );

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.totalTransactions).toBe(0); // No sales tomorrow
  });

  it("400: rejects invalid startDate", async () => {
    const res = await request(app).get(
      "/api/reports/sales?startDate=invalid-date"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("400: rejects invalid endDate", async () => {
    const res = await request(app).get(
      "/api/reports/sales?endDate=not-a-date"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("200: handles empty dataset", async () => {
    const res = await request(app).get("/api/reports/sales");

    expect(res.statusCode).toBe(200);
    expect(res.body.data.summary.totalTransactions).toBe(0);
    expect(res.body.data.summary.totalRevenue).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/purchases
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/purchases", () => {
  
  it("200: returns purchase report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/purchases");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.purchasesByProduct).toBeDefined();
    expect(res.body.data.purchasesByCategory).toBeDefined();
    expect(res.body.data.purchasesOverTime).toBeDefined();
    expect(res.body.data.topSuppliers).toBeDefined();
  });

  it("200: summary has correct purchase calculations", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/purchases");

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    
    expect(summary.totalTransactions).toBe(2); // 2 purchases
    expect(summary.totalUnitsPurchased).toBe(30); // 20 + 10
    expect(summary.totalPurchaseCost).toBe(4000); // (20*100) + (10*200)
  });

  it("200: topSuppliers includes supplier details", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/purchases");

    expect(res.statusCode).toBe(200);
    const topSuppliers = res.body.data.topSuppliers;
    
    expect(Array.isArray(topSuppliers)).toBe(true);
    expect(topSuppliers.length).toBeGreaterThan(0);
    expect(topSuppliers[0].supplierName).toBe("Test Supplier");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/inventory
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/inventory", () => {
  
  it("200: returns inventory report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/inventory");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.inventoryByCategory).toBeDefined();
    expect(res.body.data.lowStockProducts).toBeDefined();
    expect(res.body.data.outOfStockProducts).toBeDefined();
    expect(res.body.data.stockMovementSummary).toBeDefined();
  });

  it("200: summary calculates total inventory value", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/inventory");

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    
    expect(summary.totalProducts).toBe(2);
    expect(summary.totalQuantity).toBeGreaterThan(0);
    expect(summary.totalInventoryValue).toBeGreaterThan(0);
  });

  it("200: identifies low stock products correctly", async () => {
    // Create a low stock product
    const lowStockProduct = await Product.create({
      name: "Low Stock Item",
      sku: "LOW-001",
      category: "Test",
      purchasePrice: 50,
      sellingPrice: 75,
      unitPrice: 75,
      quantity: 5,
      lowStockThreshold: 10,
      description: "Low stock test"
    });

    const res = await request(app).get("/api/reports/inventory");

    expect(res.statusCode).toBe(200);
    const lowStock = res.body.data.lowStockProducts;
    
    expect(Array.isArray(lowStock)).toBe(true);
    const foundProduct = lowStock.find(p => p.sku === "LOW-001");
    expect(foundProduct).toBeDefined();
  });

  it("200: identifies out of stock products correctly", async () => {
    // Create an out of stock product
    await Product.create({
      name: "Out of Stock Item",
      sku: "OUT-001",
      category: "Test",
      purchasePrice: 50,
      sellingPrice: 75,
      unitPrice: 75,
      quantity: 0,
      lowStockThreshold: 10,
      description: "Out of stock test"
    });

    const res = await request(app).get("/api/reports/inventory");

    expect(res.statusCode).toBe(200);
    const outOfStock = res.body.data.outOfStockProducts;
    
    expect(Array.isArray(outOfStock)).toBe(true);
    const foundProduct = outOfStock.find(p => p.sku === "OUT-001");
    expect(foundProduct).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/profit-loss
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/profit-loss", () => {
  
  it("200: returns P&L report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/profit-loss");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.profitByCategory).toBeDefined();
    expect(res.body.data.profitOverTime).toBeDefined();
  });

  it("200: calculates profit correctly", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/profit-loss");

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    
    // Revenue: (5*150) + (3*300) = 1650
    // COGS: (5*100) + (3*200) = 1100
    // Profit: 1650 - 1100 = 550
    expect(summary.revenue).toBe(1650);
    expect(summary.costOfGoodsSold).toBe(1100);
    expect(summary.grossProfit).toBe(550);
  });

  it("200: calculates gross margin correctly", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/profit-loss");

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    
    // Margin = (Profit / Revenue) * 100 = (550 / 1650) * 100 ≈ 33.33%
    expect(summary.grossMargin).toBeCloseTo(33.33, 2);
  });

  it("200: profitByCategory breaks down by category", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/profit-loss");

    expect(res.statusCode).toBe(200);
    const byCategory = res.body.data.profitByCategory;
    
    expect(Array.isArray(byCategory)).toBe(true);
    expect(byCategory.length).toBeGreaterThan(0);
    
    byCategory.forEach(cat => {
      expect(cat.category).toBeDefined();
      expect(cat.revenue).toBeGreaterThanOrEqual(0);
      expect(cat.grossProfit).toBeDefined();
      expect(cat.grossMargin).toBeDefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/suppliers
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/suppliers", () => {
  
  it("200: returns supplier report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/suppliers");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.supplierPerformance).toBeDefined();
    expect(res.body.data.productsBySupplier).toBeDefined();
  });

  it("200: supplier performance includes all metrics", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/suppliers");

    expect(res.statusCode).toBe(200);
    const performance = res.body.data.supplierPerformance;
    
    expect(Array.isArray(performance)).toBe(true);
    expect(performance.length).toBeGreaterThan(0);
    
    const supplier = performance[0];
    expect(supplier.supplierName).toBeDefined();
    expect(supplier.totalPurchases).toBeGreaterThan(0);
    expect(supplier.totalPurchaseValue).toBeGreaterThan(0);
    expect(supplier.averagePurchaseValue).toBeGreaterThan(0);
  });

  it("400: rejects invalid supplier ID", async () => {
    const res = await request(app).get(
      "/api/reports/suppliers?supplierId=invalid-id"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("200: filters by supplier ID", async () => {
    const { supplier } = await seedTestData();

    const res = await request(app).get(
      `/api/reports/suppliers?supplierId=${supplier._id}`
    );

    expect(res.statusCode).toBe(200);
    const performance = res.body.data.supplierPerformance;
    expect(performance.length).toBe(1);
    expect(performance[0].supplierId.toString()).toBe(supplier._id.toString());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/customers
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/customers", () => {
  
  it("200: returns customer report with correct structure", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/customers");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.customerPerformance).toBeDefined();
    expect(res.body.data.productsByCustomer).toBeDefined();
  });

  it("200: customer performance includes all metrics", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/customers");

    expect(res.statusCode).toBe(200);
    const performance = res.body.data.customerPerformance;
    
    expect(Array.isArray(performance)).toBe(true);
    expect(performance.length).toBeGreaterThan(0);
    
    const customer = performance[0];
    expect(customer.customerName).toBeDefined();
    expect(customer.totalPurchases).toBeGreaterThan(0);
    expect(customer.totalSpent).toBeGreaterThan(0);
    expect(customer.averagePurchaseValue).toBeGreaterThan(0);
  });

  it("400: rejects invalid customer ID", async () => {
    const res = await request(app).get(
      "/api/reports/customers?customerId=invalid-id"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("200: filters by customer ID", async () => {
    const { customer } = await seedTestData();

    const res = await request(app).get(
      `/api/reports/customers?customerId=${customer._id}`
    );

    expect(res.statusCode).toBe(200);
    const performance = res.body.data.customerPerformance;
    expect(performance.length).toBe(1);
    expect(performance[0].customerId.toString()).toBe(customer._id.toString());
  });
});
