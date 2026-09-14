const {
  normalise,
  tokenise,
  editDistance,
  similarity,
  matchLine,
  matchInvoice,
} = require("../services/ai/invoiceMatcher");
const { generateDailyDemand, generateRestocks, profileFor } = require("../services/seed/demandGenerator");

/**
 * Invoice matching, against the kind of text suppliers actually print.
 *
 * The model reads the page; this decides what the page refers to. Keeping that
 * split means a wrong match is a bug with a stack trace rather than a
 * hallucination nobody can debug — and it means the hard part is testable
 * without an API key, which is what this file does.
 */

const CATALOGUE = [
  { _id: "1", name: "Colgate Toothpaste 100g", sku: "CLG-TP-100", category: "Oral Care", quantity: 40, purchasePrice: 45 },
  { _id: "2", name: "Colgate Toothbrush Soft", sku: "CLG-TB-S", category: "Oral Care", quantity: 60, purchasePrice: 25 },
  { _id: "3", name: "Lux Soap 75g", sku: "LUX-75", category: "Bath", quantity: 120, purchasePrice: 18 },
  { _id: "4", name: "Tata Salt 1kg", sku: "TATA-SALT-1", category: "Grocery", quantity: 30, purchasePrice: 22 },
  { _id: "5", name: "Pepsi 500ml", sku: "PEP-500", category: "Beverages", quantity: 80, purchasePrice: 20 },
  { _id: "6", name: "Parle-G Biscuits 200g", sku: "PARLE-G-200", category: "Snacks", quantity: 150, purchasePrice: 15 },
];

// ── Normalisation ────────────────────────────────────────────────────────────

describe("normalise", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalise("Parle-G  Biscuits, 200g!")).toBe("parle g biscuits 200g");
  });

  it("expands unit abbreviations even when glued to the number", () => {
    // "75GM" is how suppliers actually print it, and there is no word boundary
    // between the digit and the unit - so this is the case that matters.
    expect(normalise("LUX SOAP 75GM")).toContain("75g");
    expect(normalise("COLGATE 100 GM")).toContain("100g");
    expect(normalise("COLGATE 100GM")).toContain("100g");
    expect(normalise("Oil 2 LTR")).toContain("2l");
    expect(normalise("Soap 12 PCS")).toContain("piece");
  });

  it("expands the trade abbreviations that would otherwise never match", () => {
    expect(normalise("COLGATE T/PASTE")).toContain("toothpaste");
    expect(normalise("ORAL-B T/BRUSH")).toContain("toothbrush");
  });

  it("survives empty and null input", () => {
    expect(normalise(null)).toBe("");
    expect(normalise("")).toBe("");
  });
});

describe("tokenise", () => {
  it("drops noise words that carry no matching signal", () => {
    expect(tokenise("Box of Lux Soap")).not.toContain("box");
    expect(tokenise("Box of Lux Soap")).toContain("lux");
  });

  it("drops single characters", () => {
    expect(tokenise("A Lux Soap")).toEqual(["lux", "soap"]);
  });
});

describe("editDistance", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("colgate", "colgate")).toBe(0);
  });

  it("counts single-character edits", () => {
    expect(editDistance("colgate", "colgat")).toBe(1);
    expect(editDistance("colgate", "colgatte")).toBe(1);
    expect(editDistance("pepsi", "pepsy")).toBe(1);
  });

  it("handles an empty side", () => {
    expect(editDistance("", "lux")).toBe(3);
    expect(editDistance("lux", "")).toBe(3);
  });
});

// ── Matching real supplier wording ───────────────────────────────────────────

describe("matchLine", () => {
  it("matches an exact SKU regardless of how the description is written", () => {
    const result = matchLine(
      { description: "ASSORTED GOODS", sku: "clg-tp-100", quantity: 10, unitPrice: 45 },
      CATALOGUE
    );

    expect(result.status).toBe("matched");
    expect(result.confidence).toBe(1);
    expect(result.product.name).toBe("Colgate Toothpaste 100g");
  });

  it("matches an abbreviated description", () => {
    const result = matchLine(
      { description: "COLGATE T/PASTE 100GM", quantity: 24, unitPrice: 45 },
      CATALOGUE
    );

    expect(result.status).toBe("matched");
    expect(result.product.sku).toBe("CLG-TP-100");
  });

  it("tells the two Colgate products apart", () => {
    const paste = matchLine({ description: "COLGATE T/PASTE 100GM", quantity: 5, unitPrice: 45 }, CATALOGUE);
    const brush = matchLine({ description: "COLGATE T/BRUSH SOFT", quantity: 5, unitPrice: 25 }, CATALOGUE);

    expect(paste.product.sku).toBe("CLG-TP-100");
    expect(brush.product.sku).toBe("CLG-TB-S");
  });

  it("tolerates a typo", () => {
    const result = matchLine({ description: "PARLE-G BISCUTS 200G", quantity: 50, unitPrice: 15 }, CATALOGUE);

    expect(["matched", "uncertain"]).toContain(result.status);
    expect(result.product.sku).toBe("PARLE-G-200");
  });

  it("returns unmatched for something not in the catalogue", () => {
    const result = matchLine(
      { description: "HYDRAULIC FLOOR JACK 3 TON", quantity: 1, unitPrice: 8000 },
      CATALOGUE
    );

    expect(result.status).toBe("unmatched");
    expect(result.product).toBeNull();
  });

  it("refuses to preselect when two products score alike", () => {
    // "COLGATE" alone genuinely does not say which Colgate product it is.
    // Preselecting either would be a coin flip presented as a decision.
    const result = matchLine({ description: "COLGATE", quantity: 10, unitPrice: 40 }, CATALOGUE);

    expect(result.status).not.toBe("matched");
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it("offers alternatives so an uncertain match is still one click away", () => {
    const result = matchLine({ description: "COLGATE", quantity: 10, unitPrice: 40 }, CATALOGUE);
    const names = [result.product, ...result.alternatives.map((a) => a.product)]
      .filter(Boolean)
      .map((product) => product.name);

    expect(names.some((name) => name.includes("Toothpaste"))).toBe(true);
    expect(names.some((name) => name.includes("Toothbrush"))).toBe(true);
  });

  it("handles an empty catalogue without throwing", () => {
    const result = matchLine({ description: "COLGATE T/PASTE", quantity: 1, unitPrice: 45 }, []);
    expect(result.status).toBe("unmatched");
  });

  it("handles a blank description", () => {
    const result = matchLine({ description: "", quantity: 1, unitPrice: 10 }, CATALOGUE);
    expect(result.status).toBe("unmatched");
  });
});

describe("similarity", () => {
  it("scores an exact name at or near 1", () => {
    expect(similarity("Lux Soap 75g", CATALOGUE[2])).toBeGreaterThan(0.9);
  });

  it("scores an unrelated product near zero", () => {
    expect(similarity("Hydraulic Floor Jack", CATALOGUE[2])).toBeLessThan(0.2);
  });

  it("is not fooled by one shared word", () => {
    // "Soap" alone should not make a Lux match strong.
    expect(similarity("Dettol Soap", CATALOGUE[2])).toBeLessThan(0.7);
  });
});

// ── A whole invoice ──────────────────────────────────────────────────────────

describe("matchInvoice", () => {
  const lines = [
    { description: "COLGATE T/PASTE 100GM", quantity: 24, unitPrice: 45 },
    { description: "LUX SOAP 75GM", quantity: 100, unitPrice: 18 },
    { description: "TATA SALT 1KG", quantity: 40, unitPrice: 22 },
    { description: "MYSTERY ITEM XYZ", quantity: 3, unitPrice: 999 },
  ];

  it("matches what it can and says what it could not", () => {
    const result = matchInvoice(lines, CATALOGUE);

    expect(result.summary.total).toBe(4);
    expect(result.summary.matched).toBeGreaterThanOrEqual(3);
    expect(result.summary.unmatched).toBe(1);
  });

  it("keeps the original extracted line beside every match, so a wrong one is visible", () => {
    const result = matchInvoice(lines, CATALOGUE);

    for (const line of result.lines) {
      expect(line.extracted.description).toBeTruthy();
      expect(line.extracted.quantity).toBeGreaterThan(0);
    }
  });

  it("carries current stock through, so the owner can sanity-check the delivery", () => {
    const result = matchInvoice(lines, CATALOGUE);
    const matched = result.lines.find((line) => line.product);

    expect(matched.product.currentStock).toBeDefined();
  });

  it("handles an empty invoice", () => {
    expect(matchInvoice([], CATALOGUE).summary.total).toBe(0);
  });
});

// ── The seeded demand generator ──────────────────────────────────────────────

describe("demand generator", () => {
  it("is deterministic - the same SKU always produces the same history", () => {
    const first = generateDailyDemand("CLG-TP-100", 90);
    const second = generateDailyDemand("CLG-TP-100", 90);

    expect(first).toEqual(second);
  });

  it("gives different products different demand", () => {
    const a = profileFor("CLG-TP-100");
    const b = profileFor("LUX-75");

    expect(a.baseRate).not.toBe(b.baseRate);
  });

  it("produces a long tail rather than a uniform catalogue", () => {
    const rates = ["A-1", "B-2", "C-3", "D-4", "E-5", "F-6", "G-7", "H-8", "I-9", "J-10"].map(
      (sku) => profileFor(sku).baseRate
    );

    // Some products should sell many times what others do, otherwise ABC
    // analysis and dead-stock detection have nothing to distinguish.
    expect(Math.max(...rates) / Math.min(...rates)).toBeGreaterThan(3);
  });

  it("puts more demand on weekends than midweek", () => {
    const series = generateDailyDemand("CLG-TP-100", 180);

    const byWeekend = { weekend: [], weekday: [] };
    for (const point of series) {
      const day = point.date.getDay();
      byWeekend[day === 0 || day === 6 ? "weekend" : "weekday"].push(point.quantity);
    }

    const average = (values) => values.reduce((a, b) => a + b, 0) / values.length;

    expect(average(byWeekend.weekend)).toBeGreaterThan(average(byWeekend.weekday));
  });

  it("never generates a negative quantity", () => {
    for (const sku of ["CLG-TP-100", "LUX-75", "PEP-500"]) {
      for (const point of generateDailyDemand(sku, 180)) {
        expect(point.quantity).toBeGreaterThan(0);
      }
    }
  });

  it("schedules enough restocking to keep the ledger from going negative", () => {
    const sales = generateDailyDemand("CLG-TP-100", 180);
    const restocks = generateRestocks("CLG-TP-100", sales, 180);

    const events = [
      ...restocks.map((r) => ({ ...r, type: "PURCHASE" })),
      ...sales.map((s) => ({ ...s, type: "SALE" })),
    ].sort((a, b) => a.date - b.date);

    let stock = 0;
    let wentNegative = false;

    for (const event of events) {
      stock += event.type === "PURCHASE" ? event.quantity : -event.quantity;
      if (stock < 0) wentNegative = true;
    }

    expect(wentNegative).toBe(false);
  });

  it("generates enough days to fit a seasonal model", () => {
    // The forecaster needs 42+ observations before it will attempt seasonality.
    const series = generateDailyDemand("CLG-TP-100", 180);
    expect(series.length).toBeGreaterThan(42);
  });
});
