const { dayKey, addDaysToKey, findGapDays, planCatchup } = require("../services/seed/catchup");
const { generateDailyDemand } = require("../services/seed/demandGenerator");
const { buildCatalogue } = require("../services/seed/electronicsCatalogue");

/**
 * Filling an unattended stretch of the demo shop's history.
 *
 * The situation these reproduce is the real one: six months of seeded trading,
 * then a week nobody opened the app, with a couple of sales recorded by hand
 * while testing the live site sitting in the middle of it.
 */

const TODAY = new Date();
const todayKey = dayKey(TODAY);
const yesterdayKey = addDaysToKey(todayKey, -1);
const GAP = 8;
const gapStartKey = addDaysToKey(todayKey, -GAP);
const historyStartKey = addDaysToKey(todayKey, -188);

const product = {
  _id: "p1",
  sku: "ACC-002",
  name: "Wireless Mouse",
  sellingPrice: 849,
  purchasePrice: 520,
  quantity: 40,
};

// Two sales someone recorded by hand, inside the gap.
const manual = [
  { _id: "m1", type: "SALE", quantity: 2, createdAt: new Date(`${addDaysToKey(todayKey, -5)}T09:15:00Z`), prevQuantity: 44, newQuantity: 42 },
  { _id: "m2", type: "SALE", quantity: 2, createdAt: new Date(`${addDaysToKey(todayKey, -2)}T10:40:00Z`), prevQuantity: 42, newQuantity: 40 },
];

/** Replay everything in time order and report whether the ledger chains. */
const replay = (plan, existing) => {
  const updated = new Map(plan.updates.map((u) => [u._id, u]));
  const rows = [
    ...plan.created,
    ...existing.map((m) => ({ ...m, ...(updated.get(m._id) ?? {}) })),
  ].sort((a, b) => a.createdAt - b.createdAt);

  let stock = plan.openingStock;
  let chains = true;
  let negative = false;

  for (const row of rows) {
    if (row.prevQuantity !== stock) chains = false;
    stock += row.type === "PURCHASE" ? row.quantity : -row.quantity;
    if (stock < 0) negative = true;
    if (row.newQuantity !== stock) chains = false;
  }

  return { rows, stock, chains, negative };
};

describe("findGapDays", () => {
  const normalDays = () => {
    const counts = new Map();
    for (let key = historyStartKey; key < gapStartKey; key = addDaysToKey(key, 1)) counts.set(key, 400);
    return counts;
  };

  it("finds every empty day up to yesterday", () => {
    const gaps = findGapDays(normalDays(), historyStartKey, yesterdayKey);

    expect(gaps).toHaveLength(GAP);
    expect(gaps[0]).toBe(gapStartKey);
    expect(gaps[gaps.length - 1]).toBe(yesterdayKey);
  });

  it("does not mistake a couple of test sales for a day of trading", () => {
    // The trap with "fill from the last movement": two hand-recorded sales
    // would make the week look already filled.
    const counts = normalDays();
    counts.set(addDaysToKey(todayKey, -5), 2);
    counts.set(addDaysToKey(todayKey, -2), 1);

    expect(findGapDays(counts, historyStartKey, yesterdayKey)).toHaveLength(GAP);
  });

  it("finds nothing once the gap is filled, so running it twice is harmless", () => {
    const counts = normalDays();
    for (let key = gapStartKey; key <= yesterdayKey; key = addDaysToKey(key, 1)) counts.set(key, 380);

    expect(findGapDays(counts, historyStartKey, yesterdayKey)).toEqual([]);
  });

  it("never treats a merely quiet day as missing", () => {
    const counts = normalDays();
    counts.set(addDaysToKey(gapStartKey, -3), 150); // a slow Tuesday, not a hole

    expect(findGapDays(counts, historyStartKey, addDaysToKey(gapStartKey, -1))).toEqual([]);
  });
});

describe("planCatchup", () => {
  const gapDays = Array.from({ length: GAP }, (_, i) => addDaysToKey(gapStartKey, i));
  const plan = planCatchup({ product, gapDays, historyStartKey, existing: manual, now: TODAY });

  it("fills every gap day with sales, and nothing outside it", () => {
    const sales = plan.created.filter((m) => m.type === "SALE");
    const days = new Set(sales.map((m) => dayKey(m.createdAt)));

    expect(sales.length).toBeGreaterThan(0);
    for (const key of days) expect(gapDays).toContain(key);
    // A product selling ~5 a day should trade on essentially every gap day.
    expect(days.size).toBeGreaterThanOrEqual(GAP - 1);
  });

  it("never writes anything dated today or later", () => {
    for (const movement of plan.created) {
      expect(dayKey(movement.createdAt) <= yesterdayKey).toBe(true);
    }
  });

  it("keeps the ledger chained and never negative across old and new rows", () => {
    const { chains, negative } = replay(plan, manual);
    expect(chains).toBe(true);
    expect(negative).toBe(false);
  });

  it("keeps the real sales, re-chaining only their running stock", () => {
    const { rows } = replay(plan, manual);
    const kept = rows.filter((row) => row._id === "m1" || row._id === "m2");

    expect(kept).toHaveLength(2);
    expect(kept.map((row) => row.quantity)).toEqual([2, 2]);
    // Updates may only touch the two derived figures.
    for (const update of plan.updates) {
      expect(Object.keys(update).sort()).toEqual(["_id", "newQuantity", "prevQuantity"]);
    }
  });

  it("ends on the stock figure the ledger actually supports", () => {
    const { stock } = replay(plan, manual);
    expect(plan.finalStock).toBe(stock);
  });

  it("works back to the right opening stock from the product's current figure", () => {
    // 40 now, and 4 sold by hand since the gap began -> 44 that morning.
    expect(plan.openingStock).toBe(44);
  });

  it("plans the same thing twice - reruns are predictable", () => {
    const again = planCatchup({ product, gapDays, historyStartKey, existing: manual, now: TODAY });
    expect(again).toEqual(plan);
  });

  it("covers a bulk sale recorded by hand, however large", () => {
    const bulk = [{ _id: "b1", type: "SALE", quantity: 500, createdAt: new Date(`${addDaysToKey(todayKey, -3)}T11:00:00Z`), prevQuantity: 540, newQuantity: 40 }];
    const result = planCatchup({ product, gapDays, historyStartKey, existing: bulk, now: TODAY });

    expect(replay(result, bulk).negative).toBe(false);
  });

  it("does nothing when there is no gap", () => {
    const none = planCatchup({ product, gapDays: [], historyStartKey, existing: manual, now: TODAY });
    expect(none.created).toEqual([]);
    expect(none.finalStock).toBe(product.quantity);
  });
});

describe("the whole catalogue, filled", () => {
  it("fills the gap at the shop's normal pace, not a trickle or a flood", () => {
    const gapDays = Array.from({ length: GAP }, (_, i) => addDaysToKey(gapStartKey, i));
    let gapSales = 0;
    let normalSales = 0;

    for (const item of buildCatalogue()) {
      const plan = planCatchup({
        product: { ...item, _id: item.sku, quantity: 30 },
        gapDays,
        historyStartKey,
        now: TODAY,
      });
      gapSales += plan.created.filter((m) => m.type === "SALE").length;

      // What the same product did in the eight days just before the gap.
      const before = generateDailyDemand(item.sku, 188, { sellingPrice: item.sellingPrice }).filter((s) => {
        const key = dayKey(s.date);
        return key >= addDaysToKey(gapStartKey, -GAP) && key < gapStartKey;
      });
      normalSales += before.length;
    }

    // Within a fifth of the week before - the join should not be visible.
    expect(gapSales / normalSales).toBeGreaterThan(0.8);
    expect(gapSales / normalSales).toBeLessThan(1.2);
  });
});
