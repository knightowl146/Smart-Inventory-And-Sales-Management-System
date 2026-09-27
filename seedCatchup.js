require("dotenv").config();

const mongoose = require("mongoose");
const readline = require("readline");
const logger = require("./utils/logger");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");
const Supplier = require("./models/Supplier");
const Customer = require("./models/Customer");
const User = require("./models/User");
const { dayKey, addDaysToKey, findGapDays, planCatchup } = require("./services/seed/catchup");

/**
 * Fill the days the demo shop sat unattended, up to yesterday.
 *
 *   npm run seed:catchup                 plan, confirm, write
 *   npm run seed:catchup -- --dry-run    plan and print, write nothing
 *   npm run seed:catchup -- --yes        skip the confirmation (for a scheduler;
 *                                        requires DEMO_MODE=true)
 *
 * Scheduled daily by .github/workflows/demo-catchup.yml.
 *
 * Against Atlas without editing .env - SEED_MONGO_URI wins over MONGO_URI:
 *
 *   PowerShell:  $env:SEED_MONGO_URI="mongodb+srv://..."; npm run seed:catchup
 *
 * Additive: nothing that already happened is deleted or changed, except the
 * running prev/new stock figures on movements that now have new days in front
 * of them. Safe to run again - once the gap is filled there is nothing left to
 * find, and it says so. Today is left alone: today's figures are whatever the
 * shop actually does today.
 */

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_PROMPT = process.argv.includes("--yes") || process.argv.includes("-y");
const BATCH_SIZE = 1000;

const confirm = (question) =>
  new Promise((resolve) => {
    if (SKIP_PROMPT) return resolve(true);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (yes/no) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });

const pick = (array, index) => array[index % array.length];

const run = async () => {
  /**
   * Unattended runs need the database declared a demo.
   *
   * This script invents sales. Run by hand, the confirmation prompt is the
   * safeguard; run on a schedule (--yes), nobody reads the prompt, so the
   * permission has to be stated in the environment instead - the same
   * DEMO_MODE switch resetDemo.js requires. A scheduler pointed at a real
   * shop's database by mistake then fails loudly instead of quietly writing
   * a week of fictional trading into someone's books.
   */
  if (SKIP_PROMPT && process.env.DEMO_MODE !== "true") {
    throw new Error(
      "Refusing an unattended run: set DEMO_MODE=true to confirm this database is a demo. This script writes invented sales."
    );
  }

  const uri = process.env.SEED_MONGO_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Set MONGO_URI in .env, or SEED_MONGO_URI to target another database.");

  const isAtlas = uri.startsWith("mongodb+srv");
  logger.info(`Target: ${isAtlas ? "MongoDB Atlas (remote)" : "local MongoDB"}${DRY_RUN ? " - DRY RUN" : ""}`);

  await mongoose.connect(uri);

  const first = await StockMovement.findOne().sort({ createdAt: 1 }).select("createdAt").lean();
  if (!first) {
    throw new Error("No trading history at all. Run `npm run seed:history -- --fresh` first.");
  }

  const historyStartKey = dayKey(first.createdAt);
  const yesterdayKey = addDaysToKey(dayKey(new Date()), -1);

  // Sales per UTC day, the same day boundary the analytics use.
  const perDay = await StockMovement.aggregate([
    { $match: { type: "SALE" } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
  ]);
  const salesPerDay = new Map(perDay.map((row) => [row._id, row.count]));

  const gapDays = findGapDays(salesPerDay, historyStartKey, yesterdayKey);

  if (gapDays.length === 0) {
    logger.info(`No gap - trading is recorded every day from ${historyStartKey} to ${yesterdayKey}.`);
    return;
  }

  logger.info(
    `Found ${gapDays.length} day(s) with no real trading: ${gapDays[0]} to ${gapDays[gapDays.length - 1]}.`
  );

  const windowStart = new Date(`${gapDays[0]}T00:00:00Z`);

  const [products, suppliers, customers, users] = await Promise.all([
    Product.find().lean(),
    Supplier.find().select("_id").lean(),
    Customer.find().select("_id").lean(),
    User.find({ isActive: true }).select("_id").lean(),
  ]);

  if (suppliers.length === 0 || customers.length === 0) {
    throw new Error("Movements need at least one supplier and one customer. Run `npm run seed:history` first.");
  }

  const actors = users.length > 0 ? users.map((user) => user._id) : [null];

  // Which products already traded before the gap. A product added during it
  // should not suddenly acquire sales from before it existed.
  const tradedBefore = new Set(
    (await StockMovement.distinct("product", { createdAt: { $lt: windowStart } })).map(String)
  );

  const existingByProduct = new Map();
  for (const movement of await StockMovement.find({ createdAt: { $gte: windowStart } })
    .select("product type quantity createdAt prevQuantity newQuantity")
    .sort({ createdAt: 1 })
    .lean()) {
    const key = String(movement.product);
    if (!existingByProduct.has(key)) existingByProduct.set(key, []);
    existingByProduct.get(key).push(movement);
  }

  const toInsert = [];
  const toUpdate = [];
  const stockChanges = [];
  let counter = 0;
  let totals = { sales: 0, units: 0, purchases: 0, skipped: 0 };

  for (const product of products) {
    const existing = existingByProduct.get(String(product._id)) ?? [];

    // Only the gap days on or after the product existed.
    const since = tradedBefore.has(String(product._id)) ? historyStartKey : dayKey(product.createdAt);
    const productGapDays = gapDays.filter((key) => key >= since);

    const plan = planCatchup({ product, gapDays: productGapDays, historyStartKey, existing });

    for (const movement of plan.created) {
      counter += 1;
      const isSale = movement.type === "SALE";

      toInsert.push({
        product: product._id,
        type: movement.type,
        quantity: movement.quantity,
        unitPrice: isSale
          ? // Same occasional discount the original history has, so the
            // discount check sees continuity rather than a sudden clean week.
            counter % 37 === 0
            ? Math.round(product.sellingPrice * 0.75)
            : product.sellingPrice
          : product.purchasePrice,
        prevQuantity: movement.prevQuantity,
        newQuantity: movement.newQuantity,
        createdBy: pick(actors, counter),
        ...(isSale ? { customer: pick(customers, counter)._id } : { supplier: pick(suppliers, counter)._id }),
        createdAt: movement.createdAt,
        updatedAt: movement.createdAt,
      });

      if (isSale) {
        totals.sales += 1;
        totals.units += movement.quantity;
      } else {
        totals.purchases += 1;
      }
    }

    toUpdate.push(...plan.updates);
    totals.skipped += plan.skippedSales;

    if (plan.finalStock !== product.quantity) {
      stockChanges.push({ id: product._id, name: product.name, from: product.quantity, to: plan.finalStock });
    }
  }

  logger.info(
    `Plan: ${totals.sales} sales (${totals.units} units) and ${totals.purchases} deliveries across ${products.length} products.`
  );
  if (toUpdate.length > 0) {
    logger.info(`${toUpdate.length} movement(s) already in that window keep their details; only their running stock figures are re-chained.`);
  }
  logger.info(`${stockChanges.length} product stock level(s) will change to match the new ledger.`);

  if (DRY_RUN) {
    for (const change of stockChanges.slice(0, 10)) {
      logger.info(`  ${change.name}: ${change.from} -> ${change.to}`);
    }
    logger.info("Dry run - nothing written.");
    return;
  }

  if (!(await confirm(`Write this to ${isAtlas ? "ATLAS" : "the local database"}?`))) {
    logger.info("Cancelled. Nothing was written.");
    return;
  }

  // timestamps:false so the backdated createdAt survives - otherwise Mongoose
  // stamps every row with the moment of insertion and the whole gap lands today.
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    await StockMovement.insertMany(toInsert.slice(i, i + BATCH_SIZE), { timestamps: false });
  }

  if (toUpdate.length > 0) {
    await StockMovement.bulkWrite(
      toUpdate.map((update) => ({
        updateOne: {
          filter: { _id: update._id },
          update: { $set: { prevQuantity: update.prevQuantity, newQuantity: update.newQuantity } },
          timestamps: false,
        },
      }))
    );
  }

  if (stockChanges.length > 0) {
    await Product.bulkWrite(
      stockChanges.map((change) => ({
        updateOne: { filter: { _id: change.id }, update: { $set: { quantity: change.to } } },
      }))
    );
  }

  logger.info(`Done. Wrote ${toInsert.length} movements; trading now runs every day up to ${yesterdayKey}.`);
};

run()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
