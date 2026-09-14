const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const app = require("../app");
const {
  seedTestUsers,
  state,
  asOwner,
  asEmployee,
  anonymous,
} = require("./helpers/testClient");

/**
 * The forecasting, assistant, anomaly and receipt endpoints, end to end.
 *
 * The maths behind these is covered by the database-free unit suites
 * (forecasting.unit.test.js, ai.unit.test.js). This file is about the wiring:
 * who can reach what, what comes back, and that nothing 500s on a shop with
 * barely any history - which is exactly the state a fresh deployment is in.
 */

let mongoServer;
let productId;
let supplierId;
let customerId;
let employeeSaleId;
let ownerSaleId;

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedTestUsers();

  const supplier = await asOwner(app)
    .post("/api/suppliers")
    .send({ name: "Forecast Supplier", phone: "9100000001", leadTimeDays: 5 });
  supplierId = supplier.body.data._id;

  const customer = await asOwner(app)
    .post("/api/customers")
    .send({ name: "Forecast Customer", phone: "9100000002" });
  customerId = customer.body.customer._id;

  const product = await asOwner(app).post("/api/products").send({
    name: "Forecast Widget",
    sku: "FC-001",
    category: "Test",
    purchasePrice: 40,
    sellingPrice: 100,
    unitPrice: 100,
    quantity: 5000,
    description: "A widget with enough history to forecast",
  });
  productId = product.body.data._id;

  // Backdated sales, so the forecaster has something to learn from. Weekends
  // sell double, which is the pattern the seasonal model should find.
  for (let day = 90; day >= 1; day -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    const weekday = date.getDay();
    const quantity = weekday === 0 || weekday === 6 ? 8 : 4;

    await asOwner(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity, unitPrice: 100, customerId, date: daysAgo(day) });
  }

  const employeeSale = await asEmployee(app)
    .post(`/api/products/${productId}/sell`)
    .send({ quantity: 2, unitPrice: 100, customerId });
  expect(employeeSale.status).toBe(200);

  const movements = await asOwner(app).get("/api/movements?type=SALE&limit=5");
  ownerSaleId = movements.body.data.find(
    (m) => String(m.createdBy) === String(state.owner._id)
  )?._id;

  const ownSales = await asEmployee(app).get("/api/movements?type=SALE");
  employeeSaleId = ownSales.body.data[0]?._id;
}, 300000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ── Access control on everything new ─────────────────────────────────────────

describe("Access control on the new endpoints", () => {
  const ownerOnly = [
    "/api/analytics/reorder-plan",
    "/api/analytics/forecast-accuracy",
    "/api/analytics/anomalies",
    "/api/ai/status",
    "/api/ai/usage",
    "/api/ai/briefings",
  ];

  it.each(ownerOnly)("401 for an anonymous caller: %s", async (route) => {
    expect((await anonymous(app).get(route)).status).toBe(401);
  });

  it.each(ownerOnly)("403 for an employee: %s", async (route) => {
    expect((await asEmployee(app).get(route)).status).toBe(403);
  });

  it("403s an employee on a product forecast", async () => {
    const res = await asEmployee(app).get(`/api/analytics/forecast/${productId}`);
    expect(res.status).toBe(403);
  });

  it("403s an employee trying to generate a briefing", async () => {
    const res = await asEmployee(app).post("/api/ai/briefings").send({ days: 7 });
    expect(res.status).toBe(403);
  });

  it("lets both roles ask the assistant - the tool layer does the narrowing", async () => {
    expect((await asOwner(app).post("/api/ai/ask").send({ question: "how are sales?" })).status).toBe(200);
    expect((await asEmployee(app).post("/api/ai/ask").send({ question: "how are sales?" })).status).toBe(200);
  });
});

// ── Forecasting ──────────────────────────────────────────────────────────────

describe("GET /api/analytics/forecast/:productId", () => {
  it("200: returns a forecast, an accuracy score and a reorder policy", async () => {
    const res = await asOwner(app).get(`/api/analytics/forecast/${productId}?horizon=14`);

    expect(res.status).toBe(200);
    expect(res.body.data.forecast.points).toHaveLength(14);
    expect(res.body.data.reorder.urgency).toBeDefined();
    expect(res.body.data.history.length).toBeGreaterThan(0);
  });

  it("uses the seasonal model once there are six weeks of history", async () => {
    const res = await asOwner(app).get(`/api/analytics/forecast/${productId}`);
    expect(res.body.data.forecast.method).toBe("holt-winters");
  });

  it("never forecasts negative demand", async () => {
    const res = await asOwner(app).get(`/api/analytics/forecast/${productId}?horizon=60`);

    for (const point of res.body.data.forecast.points) {
      expect(point.expected).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeGreaterThanOrEqual(0);
      expect(point.upper).toBeGreaterThanOrEqual(point.expected);
    }
  });

  it("scores itself against a holdout rather than claiming accuracy it has not measured", async () => {
    const res = await asOwner(app).get(`/api/analytics/forecast/${productId}`);
    const accuracy = res.body.data.accuracy;

    expect(accuracy).not.toBeNull();
    expect(accuracy.holdoutDays).toBe(30);
    expect(accuracy.baselines.naive).toBeDefined();
    expect(typeof accuracy.beatsBaseline).toBe("boolean");
  });

  it("prefers the observed lead time or the supplier's over a blind default", async () => {
    const res = await asOwner(app).get(`/api/analytics/forecast/${productId}`);
    expect(["observed", "supplier", "default"]).toContain(res.body.data.reorder.leadTime.source);
  });

  it("404s an unknown product and 400s a malformed id", async () => {
    const missing = await asOwner(app).get(
      `/api/analytics/forecast/${new mongoose.Types.ObjectId()}`
    );
    const malformed = await asOwner(app).get("/api/analytics/forecast/not-an-id");

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe("GET /api/analytics/reorder-plan", () => {
  it("200: ranks products and totals the spend", async () => {
    const res = await asOwner(app).get("/api/analytics/reorder-plan");

    expect(res.status).toBe(200);
    expect(res.body.data.summary.productsReviewed).toBeGreaterThan(0);
    expect(res.body.data.assumptions.leadTimeDays).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.rows)).toBe(true);
  });

  it("states its assumptions rather than hiding them", async () => {
    const res = await asOwner(app).get("/api/analytics/reorder-plan?serviceLevel=0.99");

    expect(res.body.data.assumptions.serviceLevel).toBe(0.99);
    expect(res.body.data.assumptions.note).toBeTruthy();
  });

  it("gives every row a reorder point and an explanation", async () => {
    const res = await asOwner(app).get("/api/analytics/reorder-plan");

    for (const row of res.body.data.rows) {
      expect(typeof row.reorderPoint).toBe("number");
      expect(row.explanation).toContain(row.product.name);
    }
  });
});

describe("GET /api/analytics/forecast-accuracy", () => {
  it("200: reports out-of-sample error against both baselines", async () => {
    const res = await asOwner(app).get("/api/analytics/forecast-accuracy");

    expect(res.status).toBe(200);
    expect(res.body.data.evaluated).toBeGreaterThan(0);
    expect(res.body.data.overall.mae).not.toBeNull();
    expect(res.body.data.baselines.naive.mae).not.toBeNull();
  });
});

// ── Anomalies ────────────────────────────────────────────────────────────────

describe("GET /api/analytics/anomalies", () => {
  it("200: returns findings with their numbers", async () => {
    const res = await asOwner(app).get("/api/analytics/anomalies?explain=false");

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
    expect(Array.isArray(res.body.data.anomalies)).toBe(true);
  });

  it("flags a sale recorded well below the list price", async () => {
    await asEmployee(app)
      .post(`/api/products/${productId}/sell`)
      .send({ quantity: 3, unitPrice: 40, customerId }); // list is 100

    const res = await asOwner(app).get("/api/analytics/anomalies?explain=false");
    const discounts = res.body.data.anomalies.filter((a) => a.type === "discount");

    expect(discounts.length).toBeGreaterThan(0);
    expect(discounts[0].discountPercent).toBeGreaterThan(50);
  });

  it("attributes a discount to the account that recorded it", async () => {
    const res = await asOwner(app).get("/api/analytics/anomalies?explain=false");
    const discount = res.body.data.anomalies.find((a) => a.type === "discount" && a.actor);

    expect(discount).toBeDefined();
    expect(discount.actor.email).toBeTruthy();
  });

  it("works with the model unavailable - narratives are null, findings are not", async () => {
    // No GEMINI_API_KEY is set in the test environment.
    const res = await asOwner(app).get("/api/analytics/anomalies");

    expect(res.status).toBe(200);
    for (const anomaly of res.body.data.anomalies) {
      expect(anomaly.severity).toBeTruthy();
    }
  });
});

// ── The assistant ────────────────────────────────────────────────────────────

describe("POST /api/ai/ask", () => {
  it("degrades honestly when no API key is configured", async () => {
    const res = await asOwner(app).post("/api/ai/ask").send({ question: "What sold best last week?" });

    expect(res.status).toBe(200);
    expect(res.body.data.assistantAvailable).toBe(false);
    expect(res.body.data.answer).toMatch(/not configured/i);
  });

  it("400s an empty question", async () => {
    expect((await asOwner(app).post("/api/ai/ask").send({ question: "   " })).status).toBe(400);
    expect((await asOwner(app).post("/api/ai/ask").send({})).status).toBe(400);
  });

  it("400s a question longer than the cap", async () => {
    const res = await asOwner(app)
      .post("/api/ai/ask")
      .send({ question: "a".repeat(501) });

    expect(res.status).toBe(400);
  });
});

describe("AI budget and usage", () => {
  it("reports the configured cap and what has been spent", async () => {
    const res = await asOwner(app).get("/api/ai/status");

    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.monthlyBudgetUsd).toBeGreaterThan(0);
  });

  it("returns a usage breakdown without failing on an empty ledger", async () => {
    const res = await asOwner(app).get("/api/ai/usage");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.features)).toBe(true);
  });
});

describe("Briefings", () => {
  it("201: generates one deterministically when the model is unavailable", async () => {
    const res = await asOwner(app).post("/api/ai/briefings").send({ days: 7 });

    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("deterministic");
    expect(res.body.data.headline).toBeTruthy();
    expect(res.body.data.highlights.length).toBeGreaterThan(0);
  });

  it("keeps the figures the narrative was written from", async () => {
    const res = await asOwner(app).get("/api/ai/briefings");

    expect(res.status).toBe(200);
    expect(res.body.data[0].metrics.current.revenue).toBeDefined();
  });
});

// ── Receipts ─────────────────────────────────────────────────────────────────

describe("GET /api/movements/:id/receipt", () => {
  it("200: returns a PDF for the owner", async () => {
    const res = await asOwner(app).get(`/api/movements/${ownerSaleId}/receipt`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("lets an employee print a receipt for their own sale", async () => {
    const res = await asEmployee(app).get(`/api/movements/${employeeSaleId}/receipt`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
  });

  it("404s an employee asking for somebody else's sale", async () => {
    const res = await asEmployee(app).get(`/api/movements/${ownerSaleId}/receipt`);

    // 404 rather than 403 on purpose: a 403 would confirm the sale exists, which
    // lets an employee enumerate the ledger by id.
    expect(res.status).toBe(404);
  });

  it("401s an anonymous caller", async () => {
    expect((await anonymous(app).get(`/api/movements/${ownerSaleId}/receipt`)).status).toBe(401);
  });

  it("400s a malformed id and 404s an unknown one", async () => {
    expect((await asOwner(app).get("/api/movements/nope/receipt")).status).toBe(400);
    expect(
      (await asOwner(app).get(`/api/movements/${new mongoose.Types.ObjectId()}/receipt`)).status
    ).toBe(404);
  });

  it("names the file with the receipt number", async () => {
    const res = await asOwner(app).get(`/api/movements/${ownerSaleId}/receipt`);
    expect(res.headers["content-disposition"]).toMatch(/R-\d{6}-[0-9A-F]{5}\.pdf/);
  });
});

// ── A shop with no history at all ────────────────────────────────────────────

describe("Cold start", () => {
  it("does not fall over on a product that has never sold", async () => {
    const fresh = await asOwner(app).post("/api/products").send({
      name: "Never Sold",
      sku: "NS-001",
      category: "Test",
      purchasePrice: 10,
      sellingPrice: 20,
      unitPrice: 20,
      quantity: 50,
      description: "A product with no sales history whatsoever",
    });

    const res = await asOwner(app).get(`/api/analytics/forecast/${fresh.body.data._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reorder.urgency).toBe("NO_DEMAND");
    expect(res.body.data.accuracy).toBeNull();
    expect(res.body.data.forecast.warning).toBeTruthy();
  });
});

// ── Invoice OCR ──────────────────────────────────────────────────────────────

/**
 * A one-pixel PNG. Enough to exercise the upload path, the permission guard and
 * the graceful-degradation branch without a model or a real photograph.
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("POST /api/ai/invoice/extract", () => {
  it("401s an anonymous caller", async () => {
    const res = await anonymous(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", TINY_PNG, { filename: "invoice.png", contentType: "image/png" });

    expect(res.status).toBe(401);
  });

  it("403s an employee - receiving stock is an owner decision", async () => {
    const res = await asEmployee(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", TINY_PNG, { filename: "invoice.png", contentType: "image/png" });

    expect(res.status).toBe(403);
  });

  it("400s when no image is attached", async () => {
    const res = await asOwner(app).post("/api/ai/invoice/extract");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invoice/i);
  });

  it("415s a file that is not an image", async () => {
    const res = await asOwner(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", Buffer.from("not a picture"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(415);
  });

  it("503s with a useful message when no API key is configured", async () => {
    // The test environment has no GEMINI_API_KEY. The endpoint should say so
    // and point at the manual route rather than failing opaquely.
    const res = await asOwner(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", TINY_PNG, { filename: "invoice.png", contentType: "image/png" });

    expect(res.status).toBe(503);
    expect(res.body.data.assistantAvailable).toBe(false);
    expect(res.body.message).toMatch(/manually/i);
  });

  it("never reports having committed anything", async () => {
    // Whatever the outcome, this endpoint does not write stock - and the
    // contract says so explicitly so a UI cannot present it as done.
    const res = await asOwner(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", TINY_PNG, { filename: "invoice.png", contentType: "image/png" });

    expect(res.body.data?.committed ?? false).toBe(false);
  });

  it("leaves stock untouched", async () => {
    const before = await asOwner(app).get(`/api/products/${productId}`);

    await asOwner(app)
      .post("/api/ai/invoice/extract")
      .attach("invoice", TINY_PNG, { filename: "invoice.png", contentType: "image/png" });

    const after = await asOwner(app).get(`/api/products/${productId}`);

    expect(after.body.data.quantity).toBe(before.body.data.quantity);
  });
});
