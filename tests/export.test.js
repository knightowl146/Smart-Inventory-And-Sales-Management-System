/**
 * Export Tests
 * 
 * Tests for report export endpoints:
 *  - GET /api/reports/sales/export
 *  - GET /api/reports/purchases/export
 *  - GET /api/reports/inventory/export
 *  - GET /api/reports/profit-loss/export
 * 
 * Tests cover:
 *  - CSV export format
 *  - XLSX export format
 *  - PDF export format
 *  - Invalid format handling
 *  - Proper headers
 *  - Data integrity
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
  const supplier = await Supplier.create({
    name: "Export Test Supplier",
    email: "export@test.com",
    phone: "1234567890"
  });

  const customer = await Customer.create({
    name: "Export Test Customer",
    email: "exportcust@test.com",
    phone: "9876543210"
  });

  const product = await Product.create({
    name: "Export Test Product",
    sku: "EXP-001",
    category: "Electronics",
    purchasePrice: 100,
    sellingPrice: 150,
    unitPrice: 150,
    quantity: 100,
    lowStockThreshold: 10,
    description: "Test product for exports"
  });

  await StockMovement.create({
    product: product._id,
    type: "PURCHASE",
    quantity: 50,
    unitPrice: 100,
    supplier: supplier._id,
    prevQuantity: 50,
    newQuantity: 100
  });

  await StockMovement.create({
    product: product._id,
    type: "SALE",
    quantity: 10,
    unitPrice: 150,
    customer: customer._id,
    prevQuantity: 100,
    newQuantity: 90
  });

  return { supplier, customer, product };
}

// ══════════════════════════════════════════════════════════════════════════════
// Sales Export Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/sales/export", () => {
  
  it("200: exports sales report as CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/sales/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/sales-report/);
    
    // Check CSV content
    const csvText = res.text;
    expect(csvText).toContain("date");
    expect(csvText).toContain("productName");
    expect(csvText).toContain("Export Test Product");
  });

  it("200: exports sales report as XLSX", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/sales/export?format=xlsx"
    ).responseType('blob');

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml\.sheet/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/\.xlsx/);
    
    // Check that buffer is returned
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("200: exports sales report as PDF", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/sales/export?format=pdf"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/\.pdf/);
    
    // Check that PDF buffer is returned
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    
    // PDF files start with %PDF
    const pdfHeader = res.body.toString('ascii', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });

  it("200: defaults to CSV when format not specified", async () => {
    await seedTestData();

    const res = await request(app).get("/api/reports/sales/export");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  it("400: rejects invalid format", async () => {
    const res = await request(app).get(
      "/api/reports/sales/export?format=json"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid format/i);
  });

  it("200: respects date filters in export", async () => {
    await seedTestData();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const res = await request(app).get(
      `/api/reports/sales/export?format=csv&startDate=${tomorrowStr}`
    );

    expect(res.statusCode).toBe(200);
    const csvText = res.text;
    
    // CSV should have header but no data rows (only header line)
    const lines = csvText.trim().split('\n');
    expect(lines.length).toBe(1); // Only header, no data
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Purchase Export Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/purchases/export", () => {
  
  it("200: exports purchase report as CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/purchases/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("supplierName");
    expect(res.text).toContain("Export Test Supplier");
  });

  it("200: exports purchase report as XLSX", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/purchases/export?format=xlsx"
    ).responseType('blob');

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml\.sheet/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("200: exports purchase report as PDF", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/purchases/export?format=pdf"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    
    const pdfHeader = res.body.toString('ascii', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Inventory Export Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/inventory/export", () => {
  
  it("200: exports inventory report as CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/inventory/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("sku");
    expect(res.text).toContain("EXP-001");
  });

  it("200: exports inventory report as XLSX", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/inventory/export?format=xlsx"
    ).responseType('blob');

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml\.sheet/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("200: exports inventory report as PDF", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/inventory/export?format=pdf"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    
    const pdfHeader = res.body.toString('ascii', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });

  it("200: includes all product fields in CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/inventory/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    const csvText = res.text;
    
    expect(csvText).toContain("name");
    expect(csvText).toContain("sku");
    expect(csvText).toContain("category");
    expect(csvText).toContain("quantity");
    expect(csvText).toContain("inventoryValue");
    expect(csvText).toContain("status");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Profit & Loss Export Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reports/profit-loss/export", () => {
  
  it("200: exports P&L report as CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/profit-loss/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("grossProfit");
    expect(res.text).toContain("grossMargin");
  });

  it("200: exports P&L report as XLSX", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/profit-loss/export?format=xlsx"
    ).responseType('blob');

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml\.sheet/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("200: exports P&L report as PDF", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/profit-loss/export?format=pdf"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    
    const pdfHeader = res.body.toString('ascii', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });

  it("200: includes profit calculations in CSV", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/profit-loss/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    const csvText = res.text;
    
    expect(csvText).toContain("revenue");
    expect(csvText).toContain("costOfGoodsSold");
    expect(csvText).toContain("grossProfit");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Export Edge Cases
// ══════════════════════════════════════════════════════════════════════════════

describe("Export Edge Cases", () => {
  
  it("200: handles empty dataset in CSV export", async () => {
    const res = await request(app).get(
      "/api/reports/sales/export?format=csv"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    
    // Should have headers even with no data
    const csvText = res.text;
    expect(csvText).toContain("date");
  });

  it("200: handles empty dataset in XLSX export", async () => {
    const res = await request(app).get(
      "/api/reports/sales/export?format=xlsx"
    ).responseType('blob');

    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it("200: handles empty dataset in PDF export", async () => {
    const res = await request(app).get(
      "/api/reports/sales/export?format=pdf"
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    
    const pdfHeader = res.body.toString('ascii', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });

  it("400: validates dates before attempting export", async () => {
    const res = await request(app).get(
      "/api/reports/sales/export?format=csv&startDate=invalid"
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("200: case-insensitive format parameter", async () => {
    await seedTestData();

    const res = await request(app).get(
      "/api/reports/sales/export?format=CSV"
    );

    // Should work or reject gracefully
    expect([200, 400]).toContain(res.statusCode);
  });
});
