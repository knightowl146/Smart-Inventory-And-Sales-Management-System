const { TOOLS, TOOLS_BY_NAME, toolDeclarationsFor, parseRange } = require("../services/ai/tools");
const { executeTool } = require("../services/ai/toolExecutor");
const { deterministicBriefing } = require("../services/ai/briefing");
const { receiptNumberFor, money } = require("../services/receiptService");
const { renderReceipt } = require("../services/receiptService");
const { Writable } = require("stream");

/**
 * The AI layer's guarantees, tested without a model or a database.
 *
 * The claim this feature makes is that the assistant is bound by the same
 * permission table as the people using it. That is worth proving directly
 * rather than asserting in a README, and it can be proven here because the
 * refusal happens before any handler runs - no Mongo needed to show that an
 * employee cannot reach profit data through the assistant.
 */

const owner = { id: "o1", name: "Owner", email: "owner@shop.test", role: "owner" };
const employee = { id: "e1", name: "Employee", email: "staff@shop.test", role: "employee" };

// ── Tool registry hygiene ────────────────────────────────────────────────────

describe("tool registry", () => {
  it("gives every tool a permission - none may default to open", () => {
    for (const tool of TOOLS) {
      expect(typeof tool.permission).toBe("string");
      expect(tool.permission.length).toBeGreaterThan(0);
    }
  });

  it("gives every tool a description and a parameter schema the model can read", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters.type).toBe("object");
      expect(tool.handler).toBeInstanceOf(Function);
    }
  });

  it("has no duplicate tool names", () => {
    expect(TOOLS_BY_NAME.size).toBe(TOOLS.length);
  });

  it("exposes only read operations - the assistant cannot change anything", () => {
    // A name check is crude but catches the obvious mistake of adding a
    // "record_sale" tool later without thinking about it.
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^(get|find|forecast|list|search)_/);
    }
  });
});

// ── What each role is even offered ───────────────────────────────────────────

describe("toolDeclarationsFor", () => {
  it("offers the owner every tool", () => {
    expect(toolDeclarationsFor("owner")).toHaveLength(TOOLS.length);
  });

  it("offers an employee strictly fewer", () => {
    const employeeTools = toolDeclarationsFor("employee");

    expect(employeeTools.length).toBeGreaterThan(0);
    expect(employeeTools.length).toBeLessThan(TOOLS.length);
  });

  it("never shows an employee the finance tools in the first place", () => {
    const names = toolDeclarationsFor("employee").map((tool) => tool.name);

    expect(names).not.toContain("get_profit_and_loss");
    expect(names).not.toContain("get_supplier_summary");
  });

  it("sends the model names, descriptions and schemas only - never a handler", () => {
    for (const declaration of toolDeclarationsFor("owner")) {
      expect(Object.keys(declaration).sort()).toEqual(["description", "name", "parameters"]);
    }
  });

  it("offers an unknown role nothing", () => {
    expect(toolDeclarationsFor("intern")).toEqual([]);
  });
});

// ── The refusal, which is the whole point ────────────────────────────────────

describe("executeTool", () => {
  it("refuses a finance tool for an employee before touching the database", async () => {
    // No mongoose connection exists in this suite. If the permission check ran
    // after the handler, this would hang or throw a connection error instead of
    // returning a clean refusal - so this test also proves the ordering.
    const result = await executeTool("get_profit_and_loss", { days: 30 }, employee);

    expect(result.ok).toBe(false);
    expect(result.refused).toBe(true);
    expect(result.error).toMatch(/permission/i);
  });

  it("refuses supplier data for an employee", async () => {
    const result = await executeTool("get_supplier_summary", {}, employee);
    expect(result.refused).toBe(true);
  });

  it("tells the model not to speculate when it refuses", async () => {
    const result = await executeTool("get_profit_and_loss", {}, employee);

    // The refusal text is itself a prompt - a bare "denied" invites the model to
    // fill the gap from context.
    expect(result.error).toMatch(/do not speculate/i);
  });

  it("handles a hallucinated tool name without crashing", async () => {
    const result = await executeTool("drop_all_products", {}, owner);

    expect(result.ok).toBe(false);
    expect(result.refused).toBe(false);
    expect(result.error).toMatch(/No tool named/);
  });

  it("refuses for an unknown role rather than failing open", async () => {
    const result = await executeTool("get_sales_summary", {}, { ...employee, role: "intern" });
    expect(result.refused).toBe(true);
  });
});

// ── Argument parsing ─────────────────────────────────────────────────────────

describe("parseRange", () => {
  it("defaults to the last 30 days", () => {
    const { start, end } = parseRange({});
    const days = Math.round((end - start) / (24 * 60 * 60 * 1000));

    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("honours explicit dates", () => {
    const { start, end } = parseRange({ from: "2026-01-01", to: "2026-02-01" });

    expect(start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it("falls back to a day window when the model sends nonsense dates", () => {
    const { start, end } = parseRange({ from: "last tuesday", days: 7 });

    expect(start instanceof Date).toBe(true);
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(end instanceof Date).toBe(true);
  });
});

// ── Briefing fallback ────────────────────────────────────────────────────────

describe("deterministicBriefing", () => {
  const metrics = {
    period: { from: "2026-09-01", to: "2026-09-08" },
    current: { revenue: 12500, cost: 8000, grossProfit: 4500, units: 320, transactions: 96 },
    previous: { revenue: 10000, cost: 6500, grossProfit: 3500, units: 260, transactions: 80 },
    change: { revenuePercent: 25, unitsPercent: 23.1, transactionsPercent: 20 },
    marginPercent: 36,
    topProducts: [{ name: "Colgate 100g", units: 40, revenue: 2000 }],
    lowStockCount: 4,
    needingReorderCount: 6,
    catalogueSize: 40,
  };

  it("produces a usable briefing with no model at all", () => {
    const briefing = deterministicBriefing(metrics);

    expect(briefing.source).toBe("deterministic");
    expect(briefing.headline).toContain("12500");
    expect(briefing.highlights.length).toBeGreaterThanOrEqual(3);
  });

  it("suggests acting on the reorder plan when products need ordering", () => {
    const briefing = deterministicBriefing(metrics);
    expect(briefing.actions.join(" ")).toMatch(/reorder plan/i);
  });

  it("says so plainly when there is no prior period to compare against", () => {
    const briefing = deterministicBriefing({
      ...metrics,
      change: { revenuePercent: null, unitsPercent: null, transactionsPercent: null },
    });

    expect(briefing.headline).toMatch(/no prior period/i);
  });

  it("does not claim a best seller when nothing sold", () => {
    const briefing = deterministicBriefing({
      ...metrics,
      current: { revenue: 0, cost: 0, grossProfit: 0, units: 0, transactions: 0 },
      topProducts: [],
    });

    expect(briefing.highlights.join(" ")).toMatch(/No sales were recorded/);
  });

  it("flags a sharp fall in revenue as worth investigating", () => {
    const briefing = deterministicBriefing({
      ...metrics,
      change: { ...metrics.change, revenuePercent: -40 },
    });

    expect(briefing.actions.join(" ")).toMatch(/fell noticeably/i);
  });
});

// ── Receipts ─────────────────────────────────────────────────────────────────

describe("receipt helpers", () => {
  it("derives a stable receipt number from the sale, so a reprint matches", () => {
    const id = "652f1a2b3c4d5e6f7a8b9c0d";
    const date = new Date("2026-09-14T10:30:00Z");

    expect(receiptNumberFor(id, date)).toBe(receiptNumberFor(id, date));
    expect(receiptNumberFor(id, date)).toMatch(/^R-260914-[0-9A-F]{5}$/);
  });

  it("gives different sales different numbers", () => {
    const date = new Date("2026-09-14T10:30:00Z");

    expect(receiptNumberFor("652f1a2b3c4d5e6f7a8b9c0d", date)).not.toBe(
      receiptNumberFor("652f1a2b3c4d5e6f7a8b9c111", date)
    );
  });

  it("formats amounts to two decimal places", () => {
    expect(money(12)).toBe("12.00");
    expect(money(12.005)).toBe("12.01");
    expect(money(null)).toBe("0.00");
  });
});

const renderToBuffer = (sale, shop) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    sink.on("finish", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);

    renderReceipt(sale, shop, sink);
  });

describe("renderReceipt", () => {
  const sale = {
    receiptNumber: "R-260914-9C0D",
    date: new Date("2026-09-14T10:30:00Z"),
    product: { name: "Colgate Toothpaste 100g", sku: "CLG-100" },
    quantity: 3,
    unitPrice: 55,
    customer: { name: "Walk In", phone: "9000000001" },
    servedBy: { name: "Test Employee", role: "employee" },
  };

  it("produces a valid PDF", async () => {
    const pdf = await renderToBuffer(sale, { name: "Corner Shop" });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);
  });

  it("renders without a customer or a served-by, which older sales lack", async () => {
    const pdf = await renderToBuffer(
      { ...sale, customer: null, servedBy: null },
      { name: "Corner Shop" }
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders with no shop details configured", async () => {
    const pdf = await renderToBuffer(sale, {});
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("takes no cost price - a receipt cannot leak a margin it was never given", () => {
    // The response filter that strips cost fields elsewhere only wraps res.json,
    // and a PDF stream bypasses it entirely. So the guarantee has to live in the
    // shape of the input: renderReceipt is given a selling price and nothing else.
    const raw = require("fs").readFileSync(
      require.resolve("../services/receiptService"),
      "utf-8"
    );

    // Strip comments first - the file explains in prose that it never prints a
    // margin, and matching that sentence would make this test pass for the
    // wrong reason (and fail the moment the comment was reworded).
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/purchasePrice/);
    expect(code).not.toMatch(/costPrice/);
    expect(code).not.toMatch(/grossProfit|profitMargin|marginPercent/);
    // Case-sensitive: the file's page-layout constant is MARGIN, and the
    // pdfkit option is `margins`. Neither is a financial figure.
    expect(code).not.toMatch(/\bmargin\b/);
  });
});
