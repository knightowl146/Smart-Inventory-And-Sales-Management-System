/**
 * seedTimeSeries.js
 *
 * Rebuilds stock-movement history spread across the last N days so the
 * time-series features (sales trend, revenue over time, period-over-period
 * growth, AI reorder recommendations) have real data to work with.
 *
 * WHY THIS EXISTS
 * ---------------
 * The REST endpoints record a movement with whatever `createdAt` they are
 * given, but a movement can only be created one-at-a-time through them and
 * there is no endpoint that deletes movements. Rebuilding history therefore
 * has to happen at the database layer, which is what this script does.
 *
 * WHAT IT DOES
 *   1. Deletes every existing StockMovement.
 *   2. Simulates a chronological timeline per product over SPREAD_DAYS.
 *   3. Inserts the movements with explicit createdAt/updatedAt.
 *   4. Writes each product's final quantity back so stock matches its history.
 *
 * It does NOT touch products, suppliers or customers beyond updating the
 * quantity field, so your catalogue is preserved.
 *
 * USAGE
 *   node seedTimeSeries.js --confirm
 *   node seedTimeSeries.js --confirm --days=90
 *
 * The --confirm flag is required because step 1 is destructive.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");
const Supplier = require("./models/Supplier");
const Customer = require("./models/Customer");

// ---------------------------------------------------------------- settings

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--confirm");
const SPREAD_DAYS = Number((args.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic PRNG so repeated runs produce the same history.
let _seed = 20260913;
const rnd = () => {
  _seed = (_seed * 1103515245 + 12345) % 2147483648;
  return _seed / 2147483648;
};
const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/**
 * Sales profiles. These drive both how much a product sells and where its
 * stock ends up, so the inventory pages show a healthy mix of states and the
 * recommendation engine produces every status it is capable of.
 */
const PROFILES = [
  { name: "dead", weight: 20, salesPerWeek: [0, 0], qtyPerSale: [0, 0] },
  { name: "slow", weight: 25, salesPerWeek: [1, 2], qtyPerSale: [1, 3] },
  { name: "steady", weight: 35, salesPerWeek: [2, 4], qtyPerSale: [2, 6] },
  { name: "fast", weight: 20, salesPerWeek: [4, 7], qtyPerSale: [4, 12] },
];

const weightedProfile = () => {
  const total = PROFILES.reduce((s, p) => s + p.weight, 0);
  let r = rnd() * total;
  for (const p of PROFILES) {
    if ((r -= p.weight) <= 0) return p;
  }
  return PROFILES[PROFILES.length - 1];
};

// ---------------------------------------------------------------- simulation

/**
 * Builds one product's movement timeline.
 *
 * Sales are biased to grow slightly over the window so the "last 30 days vs
 * previous 30 days" comparison yields a real percentage instead of the +100%
 * you get when the earlier period is empty.
 */
function simulateProduct(product, suppliers, customers, now) {
  const profile = weightedProfile();
  const movements = [];

  // Opening stock, then restock events roughly every 2-3 weeks.
  let qty = randInt(20, 60);
  const opening = qty;

  const events = [];

  for (let day = SPREAD_DAYS; day > 0; day -= randInt(12, 20)) {
    events.push({ kind: "PURCHASE", day, quantity: randInt(15, 60) });
  }

  if (profile.salesPerWeek[1] > 0) {
    for (let day = SPREAD_DAYS; day > 0; day--) {
      // Ramp demand from ~70% at the start of the window to ~130% at the end.
      const progress = 1 - day / SPREAD_DAYS;
      const demand = (0.7 + progress * 0.6) * (randInt(...profile.salesPerWeek) / 7);
      if (rnd() < demand) {
        events.push({ kind: "SALE", day, quantity: randInt(...profile.qtyPerSale) });
      }
    }
  }

  // Chronological order: larger `day` = further in the past.
  events.sort((a, b) => b.day - a.day);

  for (const ev of events) {
    // Spread within the day so same-day records keep a stable order.
    const ts = new Date(now.getTime() - ev.day * DAY_MS + randInt(0, 20) * 3600 * 1000);
    if (ts > now) continue;

    if (ev.kind === "SALE") {
      // Never sell more than is on hand at that moment.
      const q = Math.min(ev.quantity, qty);
      if (q < 1) continue;
      movements.push({
        product: product._id,
        type: "SALE",
        quantity: q,
        unitPrice: Math.max(1, Math.round(product.sellingPrice * (0.95 + rnd() * 0.12))),
        customer: pick(customers)._id,
        prevQuantity: qty,
        newQuantity: qty - q,
        createdAt: ts,
        updatedAt: ts,
      });
      qty -= q;
    } else {
      movements.push({
        product: product._id,
        type: "PURCHASE",
        quantity: ev.quantity,
        unitPrice: Math.max(1, Math.round(product.purchasePrice * (0.92 + rnd() * 0.16))),
        supplier: pick(suppliers)._id,
        prevQuantity: qty,
        newQuantity: qty + ev.quantity,
        createdAt: ts,
        updatedAt: ts,
      });
      qty += ev.quantity;
    }
  }

  return { movements, finalQty: qty, opening, profile: profile.name };
}

// ---------------------------------------------------------------- main

async function main() {
  if (!CONFIRMED) {
    console.error(
      "\nThis DELETES every stock movement and rewrites product quantities.\n" +
        "Re-run with --confirm if that is what you want:\n\n" +
        "  node seedTimeSeries.js --confirm\n"
    );
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set (check your .env)");

  console.log("Connecting...");
  await mongoose.connect(uri);

  const [products, suppliers, customers] = await Promise.all([
    Product.find(),
    Supplier.find(),
    Customer.find(),
  ]);

  if (!products.length) throw new Error("No products found. Seed the catalogue first.");
  if (!suppliers.length) throw new Error("No suppliers found. PURCHASE movements require one.");
  if (!customers.length) throw new Error("No customers found. SALE movements require one.");

  console.log(
    `${products.length} products, ${suppliers.length} suppliers, ${customers.length} customers.`
  );

  const removed = await StockMovement.deleteMany({});
  console.log(`Deleted ${removed.deletedCount} existing movements.`);

  const now = new Date();
  const all = [];
  const quantityWrites = [];
  const profileCounts = {};

  for (const product of products) {
    const { movements, finalQty, profile } = simulateProduct(product, suppliers, customers, now);
    all.push(...movements);
    profileCounts[profile] = (profileCounts[profile] || 0) + 1;
    quantityWrites.push({
      updateOne: { filter: { _id: product._id }, update: { $set: { quantity: finalQty } } },
    });
  }

  all.sort((a, b) => a.createdAt - b.createdAt);

  console.log(`Inserting ${all.length} movements across ${SPREAD_DAYS} days...`);
  // timestamps:false stops the schema's automatic timestamps from overwriting
  // the explicit createdAt/updatedAt above.
  await StockMovement.insertMany(all, { timestamps: false });

  console.log("Writing back product quantities...");
  await Product.bulkWrite(quantityWrites);

  // ------------------------------------------------------------- summary
  const refreshed = await Product.find();
  const dist = { outOfStock: 0, low: 0, healthy: 0 };
  for (const p of refreshed) {
    if (p.quantity === 0) dist.outOfStock++;
    else if (p.quantity <= p.lowStockThreshold) dist.low++;
    else dist.healthy++;
  }

  const cutoff = new Date(now.getTime() - 30 * DAY_MS);
  const recent = all.filter((m) => m.type === "SALE" && m.createdAt >= cutoff);
  const prior = all.filter((m) => m.type === "SALE" && m.createdAt < cutoff);
  const rev = (list) => list.reduce((s, m) => s + m.quantity * m.unitPrice, 0);
  const distinctDays = new Set(all.map((m) => m.createdAt.toISOString().slice(0, 10))).size;

  console.log("\n=====================================================");
  console.log(`Movements:        ${all.length}`);
  console.log(`Distinct days:    ${distinctDays}   <- the trend chart's x-axis`);
  console.log(`Sales last 30d:   ${recent.length} (revenue ${Math.round(rev(recent))})`);
  console.log(`Sales prior 30d:  ${prior.length} (revenue ${Math.round(rev(prior))})`);
  if (rev(prior) > 0) {
    const growth = ((rev(recent) - rev(prior)) / rev(prior)) * 100;
    console.log(`Growth:           ${growth.toFixed(1)}%  <- a real number, not +100%`);
  }
  console.log(`Stock states:     ${dist.healthy} healthy / ${dist.low} low / ${dist.outOfStock} out`);
  console.log(`Sales profiles:   ${JSON.stringify(profileCounts)}`);
  console.log("=====================================================\n");
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log("Disconnected.");
  });
