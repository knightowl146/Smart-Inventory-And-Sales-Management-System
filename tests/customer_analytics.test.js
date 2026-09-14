/**
 * Tests for Customer Analytics endpoints in analyticsController.js
 *
 *  1. GET /api/analytics/customer                              (getCustomerAnalytics)
 *  2. GET /api/analytics/customer/top                         (getTopCustomers)
 *  3. GET /api/analytics/customer/:customerId/purchase-history (getCustomerPurchaseHistory)
 *  4. GET /api/analytics/customer/:customerId/spending-over-time (getCustomerSpendingOverTime)
 *
 * Uses MongoMemoryReplSet (replica set) so that MongoDB transactions work
 * inside the sellProduct endpoint (which is used to seed SALE movements).
 */

const { request, seedTestUsers } = require("./helpers/testClient");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");

// ─── Shared state ──────────────────────────────────────────────────────────────
let mongoServer;
let productId;
let customerAId, customerBId, customerCId;

// ─── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Replica set required for transactions used inside sellProduct
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  // ── Create a product with enough stock ───────────────────────────────────
  const pRes = await request(app).post("/api/products").send({
    name: "Customer Analytics Widget",
    sku: "CAW-001",
    category: "Electronics",
    purchasePrice: 50,
    sellingPrice: 100,
    unitPrice: 100,
    quantity: 1000,
    description: "Widget used for customer analytics tests",
  });
  productId = pRes.body.data._id;

  // ── Create customers ─────────────────────────────────────────────────────
  const cA = await request(app).post("/api/customers").send({
    name: "Customer Alpha",
    phone: "9100000001",
    email: "alpha@analytics.com",
  });
  customerAId = cA.body.customer._id;

  const cB = await request(app).post("/api/customers").send({
    name: "Customer Beta",
    phone: "9100000002",
    email: "beta@analytics.com",
  });
  customerBId = cB.body.customer._id;

  const cC = await request(app).post("/api/customers").send({
    name: "Customer Gamma",
    phone: "9100000003",
    email: "gamma@analytics.com",
  });
  customerCId = cC.body.customer._id;

  // ── Seed SALE movements (with customerId) ────────────────────────────────
  // Alpha: 3 sales × 10 units @ $100  →  $3,000 total
  for (let i = 0; i < 3; i++) {
    await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 10, unitPrice: 100, customerId: customerAId });
  }

  // Beta: 2 sales × 5 units @ $100  →  $1,000 total
  for (let i = 0; i < 2; i++) {
    await request(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 5, unitPrice: 100, customerId: customerBId });
  }

  // Gamma: 1 sale × 2 units @ $100  →  $200 total
  await request(app)
    .post(`/api/products/${productId}/sell`)
    .send({ quantity: 2, unitPrice: 100, customerId: customerCId });
});

// ─── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/customer  — getCustomerAnalytics
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/customer — getCustomerAnalytics", () => {
  it("200: returns success with a data object", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("data");
    expect(typeof res.body.data).toBe("object");
  });

  it("200: data has totalCustomers field as a number", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("totalCustomers");
    expect(typeof res.body.data.totalCustomers).toBe("number");
  });

  it("200: totalCustomers is at least 3 (seeded in beforeAll)", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalCustomers).toBeGreaterThanOrEqual(3);
  });

  it("200: data has totalSales as a positive number", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("totalSales");
    expect(res.body.data.totalSales).toBeGreaterThan(0);
  });

  it("200: data has totalRevenue as a positive number", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("totalRevenue");
    expect(res.body.data.totalRevenue).toBeGreaterThan(0);
  });

  it("200: data has totalQuantitySold as a positive number", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("totalQuantitySold");
    expect(res.body.data.totalQuantitySold).toBeGreaterThan(0);
  });

  it("200: data has averageSaleValue as a positive number", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("averageSaleValue");
    expect(res.body.data.averageSaleValue).toBeGreaterThan(0);
  });

  it("200: averageSaleValue equals totalRevenue / totalSales", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    const { totalRevenue, totalSales, averageSaleValue } = res.body.data;
    const expected = totalRevenue / totalSales;
    expect(averageSaleValue).toBeCloseTo(expected, 4);
  });

  it("200: totalRevenue matches seeded data (Alpha=$3000 + Beta=$1000 + Gamma=$200 = $4200)", async () => {
    const res = await request(app).get("/api/analytics/customer");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalRevenue).toBeGreaterThanOrEqual(4200);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/customer/top  — getTopCustomers
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/analytics/customer/top — getTopCustomers", () => {
  it("200: returns success with count and data array", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("count");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("200: count equals the length of data array", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(res.body.data.length);
  });

  it("200: returns at most 5 customers by default (limit=5)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("200: each customer entry has expected fields", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((c) => {
      expect(c).toHaveProperty("customerId");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("totalSpent");
      expect(c).toHaveProperty("totalQuantityPurchased");
      expect(c).toHaveProperty("salesCount");
    });
  });

  it("200: first customer has highest totalSpent (sorted desc)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    if (data.length >= 2) {
      expect(data[0].totalSpent).toBeGreaterThanOrEqual(data[1].totalSpent);
    }
  });

  it("200: Customer Alpha is the top customer (spent $3000)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    const top = res.body.data[0];
    expect(top.name).toBe("Customer Alpha");
    expect(top.totalSpent).toBe(3000);
  });

  it("200: Customer Beta is second (spent $1000)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    expect(res.body.data[1].name).toBe("Customer Beta");
    expect(res.body.data[1].totalSpent).toBe(1000);
  });

  it("200: Customer Gamma is third (spent $200)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    expect(res.body.data[2].name).toBe("Customer Gamma");
    expect(res.body.data[2].totalSpent).toBe(200);
  });

  it("200: custom limit=2 returns at most 2 customers", async () => {
    const res = await request(app).get("/api/analytics/customer/top?limit=2");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  it("200: custom limit=1 returns exactly 1 (the highest spender)", async () => {
    const res = await request(app).get("/api/analytics/customer/top?limit=1");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe("Customer Alpha");
  });

  it("200: alpha salesCount equals 3 (three sell calls)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    const alpha = res.body.data.find((c) => c.name === "Customer Alpha");
    expect(alpha).toBeDefined();
    expect(alpha.salesCount).toBe(3);
  });

  it("200: alpha totalQuantityPurchased equals 30 (3 sales x 10 units)", async () => {
    const res = await request(app).get("/api/analytics/customer/top");
    expect(res.statusCode).toBe(200);
    const alpha = res.body.data.find((c) => c.name === "Customer Alpha");
    expect(alpha.totalQuantityPurchased).toBe(30);
  });

  it("400: invalid limit (negative) returns 400", async () => {
    const res = await request(app).get("/api/analytics/customer/top?limit=-5");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/positive integer/i);
  });

  it("400: invalid limit (zero) returns 400", async () => {
    const res = await request(app).get("/api/analytics/customer/top?limit=0");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/positive integer/i);
  });

  it("200: limit capped at 100 even when requesting more", async () => {
    const res = await request(app).get(
      "/api/analytics/customer/top?limit=500"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });
});


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/customer/:customerId/purchase-history
// ══════════════════════════════════════════════════════════════════════════════

describe(
  "GET /api/analytics/customer/:customerId/purchase-history — getCustomerPurchaseHistory",
  () => {
    it("200: returns success with customer and pagination info", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("customer");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body).toHaveProperty("data");
    });

    it("200: customer object has _id, name, phone, email", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.customer).toHaveProperty("_id");
      expect(res.body.customer).toHaveProperty("name");
      expect(res.body.customer).toHaveProperty("phone");
      expect(res.body.customer.name).toBe("Customer Alpha");
    });

    it("200: data is an array of purchase records", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("200: Alpha has exactly 3 purchase records", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.totalSales).toBe(3);
      expect(res.body.data.length).toBe(3);
    });

    it("200: each record has _id, product, quantity, unitPrice, totalAmount, createdAt", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((record) => {
        expect(record).toHaveProperty("_id");
        expect(record).toHaveProperty("product");
        expect(record).toHaveProperty("quantity");
        expect(record).toHaveProperty("unitPrice");
        expect(record).toHaveProperty("totalAmount");
        expect(record).toHaveProperty("createdAt");
      });
    });

    it("200: totalAmount equals quantity x unitPrice for each record", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((record) => {
        const expected = record.quantity * record.unitPrice;
        expect(record.totalAmount).toBeCloseTo(expected, 4);
      });
    });

    it("200: pagination currentPage defaults to 1", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.currentPage).toBe(1);
    });

    it("200: pagination totalPages is at least 1 for a customer with sales", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it("200: pagination hasNextPage is false when all results fit on page 1", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      // Alpha has 3 records, default limit is 10 — all fit on page 1
      expect(res.body.pagination.hasNextPage).toBe(false);
    });

    it("200: pagination hasPreviousPage is false on page 1", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.hasPreviousPage).toBe(false);
    });

    it("200: custom limit=1 returns 1 record and indicates next page", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?limit=1`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.hasNextPage).toBe(true);
    });

    it("200: page=2 limit=1 returns second record with hasPreviousPage=true", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?page=2&limit=1`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.currentPage).toBe(2);
      expect(res.body.pagination.hasPreviousPage).toBe(true);
    });

    it("200: Beta has 2 purchase records", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerBId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.pagination.totalSales).toBe(2);
    });

    it("200: date filter startDate far in future excludes all records", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?startDate=2099-01-01`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("200: date filter endDate in the past returns empty results", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?endDate=2000-01-01`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("400: returns 400 for invalid startDate format", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?startDate=not-a-date`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid startDate/i);
    });

    it("400: returns 400 for invalid endDate format", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?endDate=garbage`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid endDate/i);
    });

    it("400: returns 400 for invalid customerId (non-ObjectId)", async () => {
      const res = await request(app).get(
        "/api/analytics/customer/not-an-id/purchase-history"
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid customer id/i);
    });

    it("404: returns 404 for valid ObjectId that does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(
        `/api/analytics/customer/${fakeId}/purchase-history`
      );
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/customer not found/i);
    });

    it("400: invalid page (zero) returns 400", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?page=0`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/positive integer/i);
    });

    it("400: invalid limit (zero) returns 400", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history?limit=0`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/positive integer/i);
    });

    it("200: records are sorted newest first (descending createdAt)", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/purchase-history`
      );
      expect(res.statusCode).toBe(200);
      const dates = res.body.data.map((r) => new Date(r.createdAt).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });
  }
);


// ══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/customer/:customerId/spending-over-time
// ══════════════════════════════════════════════════════════════════════════════

describe(
  "GET /api/analytics/customer/:customerId/spending-over-time — getCustomerSpendingOverTime",
  () => {
    it("200: returns success with customer and data array", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("customer");
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("200: customer object has _id, name, phone, email", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.customer).toHaveProperty("_id");
      expect(res.body.customer).toHaveProperty("name");
      expect(res.body.customer).toHaveProperty("phone");
      expect(res.body.customer.name).toBe("Customer Alpha");
    });

    it("200: data entries have date, totalSpent, quantityPurchased, salesCount", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((entry) => {
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("totalSpent");
        expect(entry).toHaveProperty("quantityPurchased");
        expect(entry).toHaveProperty("salesCount");
      });
    });

    it("200: date is a valid YYYY-MM-DD string", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      res.body.data.forEach((entry) => {
        expect(entry.date).toMatch(dateRegex);
      });
    });

    it("200: Alpha total spending across all dates equals $3000", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const totalSpent = res.body.data.reduce(
        (sum, e) => sum + e.totalSpent,
        0
      );
      expect(totalSpent).toBeCloseTo(3000, 2);
    });

    it("200: Alpha total quantityPurchased across all dates equals 30", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const totalQty = res.body.data.reduce(
        (sum, e) => sum + e.quantityPurchased,
        0
      );
      expect(totalQty).toBe(30);
    });

    it("200: Alpha total salesCount across all dates equals 3", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const totalSales = res.body.data.reduce(
        (sum, e) => sum + e.salesCount,
        0
      );
      expect(totalSales).toBe(3);
    });

    it("200: data is sorted ascending by date (oldest first)", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const dates = res.body.data.map((e) => e.date);
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i] <= dates[i + 1]).toBe(true);
      }
    });

    it("200: Beta total spending equals $1000", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerBId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const totalSpent = res.body.data.reduce(
        (sum, e) => sum + e.totalSpent,
        0
      );
      expect(totalSpent).toBeCloseTo(1000, 2);
    });

    it("200: Gamma total spending equals $200", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerCId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      const totalSpent = res.body.data.reduce(
        (sum, e) => sum + e.totalSpent,
        0
      );
      expect(totalSpent).toBeCloseTo(200, 2);
    });

    it("200: date filter startDate=futureDate returns empty data array", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time?startDate=2099-01-01`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("200: date filter endDate=pastDate returns empty data array", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time?endDate=2000-01-01`
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("400: returns 400 for invalid startDate", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time?startDate=bad-date`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid startDate/i);
    });

    it("400: returns 400 for invalid endDate", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time?endDate=not-valid`
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid endDate/i);
    });

    it("400: returns 400 for invalid customerId (non-ObjectId)", async () => {
      const res = await request(app).get(
        "/api/analytics/customer/invalid-id/spending-over-time"
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid customer id/i);
    });

    it("404: returns 404 for valid ObjectId that does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(
        `/api/analytics/customer/${fakeId}/spending-over-time`
      );
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/customer not found/i);
    });

    it("200: totalSpent is non-negative for all data entries", async () => {
      const res = await request(app).get(
        `/api/analytics/customer/${customerAId}/spending-over-time`
      );
      expect(res.statusCode).toBe(200);
      res.body.data.forEach((entry) => {
        expect(entry.totalSpent).toBeGreaterThanOrEqual(0);
      });
    });
  }
);
