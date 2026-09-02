const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");

let mongoServer;
let createdSupplierId;

// ─── Setup & Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ─── Helper ────────────────────────────────────────────────────────────────────
const validSupplier = () => ({
  name: "Global Supplies Co.",
  email: "contact@globalsupplies.com",
  phone: "9876543210",
  address: "12 Trade Street, Mumbai, India"
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/suppliers — Create Supplier
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/suppliers — Create Supplier", () => {
  it("201: creates a supplier with all valid fields", async () => {
    const res = await request(app).post("/api/suppliers").send(validSupplier());
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Supplier created successfully");
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.name).toBe("Global Supplies Co.");
    expect(res.body.data.email).toBe("contact@globalsupplies.com");
    createdSupplierId = res.body.data._id;
  });

  it("201: creates a supplier with only name (optional fields absent)", async () => {
    const res = await request(app).post("/api/suppliers").send({ name: "Minimal Supplier" });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Minimal Supplier");
  });

  it("400: returns error when name is missing", async () => {
    const res = await request(app).post("/api/suppliers").send({
      email: "no-name@test.com",
      phone: "1234567890"
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier name is required");
  });

  it("400: returns error when body is empty", async () => {
    const res = await request(app).post("/api/suppliers").send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier name is required");
  });

  it("201: email is stored in lowercase", async () => {
    const res = await request(app).post("/api/suppliers").send({
      name: "Case Test Supplier",
      email: "UPPER@CASE.COM"
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.email).toBe("upper@case.com");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/suppliers — Get All Suppliers
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/suppliers — Get All Suppliers", () => {
  it("200: returns array of all suppliers", async () => {
    const res = await request(app).get("/api/suppliers");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("count");
  });

  it("200: count matches the length of data array", async () => {
    const res = await request(app).get("/api/suppliers");
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(res.body.data.length);
  });

  it("200: each supplier has _id, name, createdAt, updatedAt", async () => {
    const res = await request(app).get("/api/suppliers");
    expect(res.statusCode).toBe(200);
    res.body.data.forEach((s) => {
      expect(s).toHaveProperty("_id");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("createdAt");
      expect(s).toHaveProperty("updatedAt");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/suppliers/:supplierId — Get Single Supplier
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/suppliers/:supplierId — Get Single Supplier", () => {
  it("200: returns the supplier by valid ID", async () => {
    const res = await request(app).get(`/api/suppliers/${createdSupplierId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(createdSupplierId);
    expect(res.body.data.name).toBe("Global Supplies Co.");
    expect(res.body.data.email).toBe("contact@globalsupplies.com");
    expect(res.body.data.phone).toBe("9876543210");
    expect(res.body.data.address).toBe("12 Trade Street, Mumbai, India");
  });

  it("400: returns error for invalid (non-ObjectId) supplierId", async () => {
    const res = await request(app).get("/api/suppliers/not-a-valid-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid supplier ID");
  });

  it("404: returns error for valid ObjectId that does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/suppliers/${fakeId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier not found");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/suppliers/:supplierId — Update Supplier
// ══════════════════════════════════════════════════════════════════════════════

describe("PUT /api/suppliers/:supplierId — Update Supplier", () => {
  it("200: updates supplier fields successfully", async () => {
    const res = await request(app)
      .put(`/api/suppliers/${createdSupplierId}`)
      .send({
        name: "Global Supplies Ltd.",
        email: "updated@globalsupplies.com",
        phone: "1112223333",
        address: "99 New Road, Delhi, India"
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Supplier updated successfully");
    expect(res.body.data.name).toBe("Global Supplies Ltd.");
    expect(res.body.data.email).toBe("updated@globalsupplies.com");
    expect(res.body.data.phone).toBe("1112223333");
  });

  it("200: partial update (only name) works without clearing other fields", async () => {
    const res = await request(app)
      .put(`/api/suppliers/${createdSupplierId}`)
      .send({ name: "Renamed Supplier" });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Renamed Supplier");
  });

  it("400: returns error for invalid supplierId", async () => {
    const res = await request(app)
      .put("/api/suppliers/bad-id")
      .send({ name: "Should Fail" });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid supplier ID");
  });

  it("404: returns error when supplier does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/suppliers/${fakeId}`)
      .send({ name: "Ghost Supplier" });
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier not found");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/suppliers/:supplierId — Delete Supplier
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/suppliers/:supplierId — Delete Supplier", () => {
  it("400: returns error for invalid supplierId", async () => {
    const res = await request(app).delete("/api/suppliers/bad-id");
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Invalid supplier ID");
  });

  it("404: returns error when supplier does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).delete(`/api/suppliers/${fakeId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier not found");
  });

  it("200: deletes a supplier successfully", async () => {
    const res = await request(app).delete(`/api/suppliers/${createdSupplierId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Supplier deleted successfully");
  });

  it("404: returns error when trying to delete the already-deleted supplier", async () => {
    const res = await request(app).delete(`/api/suppliers/${createdSupplierId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Supplier not found");
  });

  it("404: deleted supplier is no longer fetchable by GET", async () => {
    const res = await request(app).get(`/api/suppliers/${createdSupplierId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
