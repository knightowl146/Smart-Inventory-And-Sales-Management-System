const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../app");

let mongoServer;
let createdProductId;

// ─── Setup & Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean up collections between tests that need isolation
});

// ─── Helper: valid product payload ─────────────────────────────────────────────
const validProduct = () => ({
  name: "Test Widget",
  sku: "TW-001",
  category: "Electronics",
  purchasePrice: 50,
  sellingPrice: 80,
  quantity: 100,
  description: "A test widget for unit tests",
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/products — Create Product", () => {
  it("201: creates a product with valid data", async () => {
    const res = await request(app).post("/api/products").send(validProduct());
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.name).toBe("Test Widget");
    createdProductId = res.body.data._id; // Save for subsequent tests
  });

  it("400: returns error when required fields are missing", async () => {
    const res = await request(app).post("/api/products").send({ name: "Incomplete" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("All fields are required");
  });

  it("400: returns error when body is empty", async () => {
    const res = await request(app).post("/api/products").send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/products — Get All Products", () => {
  it("200: returns a list of products with default pagination metadata", async () => {
    const res = await request(app).get("/api/products");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("currentPage", 1);
    expect(res.body.pagination).toHaveProperty("limit", 10);
  });

  it("200: respects custom page and limit query params", async () => {
    const res = await request(app).get("/api/products?page=1&limit=5");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination.currentPage).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
  });

  it("400: returns error for invalid page parameter", async () => {
    const res = await request(app).get("/api/products?page=0");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Page must be a positive integer");
  });

  it("400: returns error for limit > 100", async () => {
    const res = await request(app).get("/api/products?limit=150");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Limit must be an integer between 1 and 100");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/products/:id — Get Product By ID", () => {
  it("200: returns a product for a valid ID", async () => {
    const res = await request(app).get(`/api/products/${createdProductId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(createdProductId);
  });

  it("400: returns error for invalid (non-ObjectId) ID", async () => {
    const res = await request(app).get("/api/products/not-a-valid-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid id");
  });

  it("404: returns error when product does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/products/${fakeId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/products/:id — Update Product", () => {
  it("200: updates allowed fields", async () => {
    const res = await request(app)
      .patch(`/api/products/${createdProductId}`)
      .send({ name: "Updated Widget", quantity: 150 });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Updated Widget");
  });

  it("400: rejects invalid field updates", async () => {
    const res = await request(app)
      .patch(`/api/products/${createdProductId}`)
      .send({ unknownField: "bad value" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid updates");
  });

  it("404: returns error for invalid ID", async () => {
    const res = await request(app).patch("/api/products/bad-id").send({ name: "X" });
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST & PUT /api/products/:id/purchase — Purchase (Add Stock)", () => {
  it("200: adds stock successfully via POST", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/purchase`)
      .send({ quantity: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Stock added successfully");
  });

  it("200: adds stock successfully via PUT", async () => {
    const res = await request(app)
      .put(`/products/${createdProductId}/purchase`)
      .send({ quantity: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Stock added successfully");
  });

  it("400: rejects zero quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/purchase`)
      .send({ quantity: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Quantity must be greater than 0");
  });

  it("400: rejects negative quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/purchase`)
      .send({ quantity: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: rejects non-integer quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/purchase`)
      .send({ quantity: 2.5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Quantity must be an integer");
  });

  it("400: rejects non-number quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/purchase`)
      .send({ quantity: "abc" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: returns error for invalid product ID", async () => {
    const res = await request(app).post("/api/products/bad-id/purchase").send({ quantity: 10 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid id");
  });

  it("404: returns error when product does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/products/${fakeId}/purchase`)
      .send({ quantity: 10 });
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/products/:id/sell — Sell Product", () => {
  it("200: sells stock successfully", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/sell`)
      .send({ quantity: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Product sold successfully");
  });

  it("400: returns error for insufficient stock", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/sell`)
      .send({ quantity: 999999 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Insufficient stock or product not found");
  });

  it("400: rejects zero quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/sell`)
      .send({ quantity: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400: rejects non-integer quantity", async () => {
    const res = await request(app)
      .post(`/api/products/${createdProductId}/sell`)
      .send({ quantity: 1.5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Quantity must be an integer");
  });

  it("400: returns error for invalid product ID", async () => {
    const res = await request(app).post("/api/products/bad-id/sell").send({ quantity: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCK MOVEMENT ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/movements — Get All Movements", () => {
  it("200: returns a paginated list of movements", async () => {
    const res = await request(app).get("/api/movements");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("currentPage", 1);
    expect(res.body.pagination).toHaveProperty("totalPages");
    expect(res.body.pagination).toHaveProperty("totalMovements");
  });

  it("200: filters by type=PURCHASE", async () => {
    const res = await request(app).get("/api/movements?type=PURCHASE");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    res.body.data.forEach((m) => expect(m.type).toBe("PURCHASE"));
  });

  it("200: filters by type=SALE", async () => {
    const res = await request(app).get("/api/movements?type=SALE");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    res.body.data.forEach((m) => expect(m.type).toBe("SALE"));
  });

  it("400: returns error for invalid type filter", async () => {
    const res = await request(app).get("/api/movements?type=INVALID");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Type must be either PURCHASE or SALE");
  });

  it("200: respects pagination params (page & limit)", async () => {
    const res = await request(app).get("/api/movements?page=1&limit=5");
    expect(res.statusCode).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.currentPage).toBe(1);
  });

  it("400: rejects limit > 100", async () => {
    const res = await request(app).get("/api/movements?limit=200");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Limit must be an integer between 1 and 100");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/movements/product/:id — Get Movements By Product", () => {
  it("200: returns movements for a valid product ID", async () => {
    const res = await request(app).get(`/api/movements/product/${createdProductId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("pagination");
  });

  it("200: all returned movements belong to the product", async () => {
    const res = await request(app).get(`/api/movements/product/${createdProductId}`);
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((m) => {
      expect(m.product._id || m.product).toBe(createdProductId);
    });
  });

  it("400: returns error for invalid (non-ObjectId) product ID", async () => {
    const res = await request(app).get("/api/movements/product/not-a-valid-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid id");
  });

  it("200: returns empty data for non-existent product ID", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/movements/product/${fakeId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("400: returns error for invalid type filter", async () => {
    const res = await request(app).get(
      `/api/movements/product/${createdProductId}?type=BADTYPE`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Type must be either PURCHASE or SALE");
  });

  it("400: rejects limit > 100", async () => {
    const res = await request(app).get(
      `/api/movements/product/${createdProductId}?limit=150`
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/movements/low-stock — Get Low Stock Products", () => {
  it("200: returns low stock products with valid pagination", async () => {
    const res = await request(app).get("/api/movements/low-stock");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("currentPage", 1);
    expect(res.body.pagination).toHaveProperty("limit", 10);
    expect(res.body.pagination.totalPages).not.toBeNaN();
  });

  it("400: returns error for invalid page parameter", async () => {
    const res = await request(app).get("/api/movements/low-stock?page=-1");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Page must be a positive integer");
  });

  it("400: returns error for invalid limit parameter", async () => {
    const res = await request(app).get("/api/movements/low-stock?limit=200");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Limit must be an integer between 1 and 100");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/products/:id — Delete Product", () => {
  it("200: deletes a product", async () => {
    const res = await request(app).delete(`/api/products/${createdProductId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Product deleted");
  });

  it("404: returns error when product does not exist", async () => {
    // Already deleted above
    const res = await request(app).delete(`/api/products/${createdProductId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("400: returns error for invalid ID", async () => {
    const res = await request(app).delete("/api/products/bad-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid id");
  });
});
