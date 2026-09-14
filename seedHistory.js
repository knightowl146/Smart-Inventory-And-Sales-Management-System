require("dotenv").config();

const mongoose = require("mongoose");
const logger = require("./utils/logger");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");
const Supplier = require("./models/Supplier");
const Customer = require("./models/Customer");
const User = require("./models/User");
const { generateDailyDemand, generateRestocks } = require("./services/seed/demandGenerator");

/**
 * Backdated trading history, deep enough to forecast from.
 *
 * The existing generateSalesAndPurchases.js writes four fixed purchase batches
 * and a handful of sales across 25 days for ten products. That populates a
 * dashboard; it does not give a seasonal model anything to fit, which is why
 * the Forecast page reports "not enough history" against it.
 *
 * This writes a full daily series per product with weekday seasonality, a
 * trend, noise and occasional spikes — see services/seed/demandGenerator.js —
 * attributes every movement to a real user, and keeps stock arithmetic
 * consistent so prevQuantity/newQuantity actually chain.
 *
 * Usage:
 *
 *   npm run seed:history                       180 days, local .env MONGO_URI
 *   npm run seed:history -- --days=365
 *   npm run seed:history -- --fresh            wipe existing movements first
 *
 * Against Atlas without editing .env — SEED_MONGO_URI wins over MONGO_URI:
 *
 *   PowerShell:  $env:SEED_MONGO_URI="mongodb+srv://..."; npm run seed:history
 *   bash:        SEED_MONGO_URI="mongodb+srv://..." npm run seed:history
 *
 * The generator is seeded from each product's SKU, so re-running produces the
 * same history. A screenshot taken today still matches the data next week.
 */

const arg = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!match) return fallback;
  return match.split("=")[1];
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const DAYS = Math.min(Math.max(Number(arg("days", 180)), 30), 730);
const FRESH = hasFlag("fresh");

const BATCH_SIZE = 1000;

/**
 * Movements need a supplier (purchases) and a customer (sales), and the schema
 * enforces it. Rather than fail on a fresh database, make a small cast.
 */
const ensureCounterparties = async () => {
  let suppliers = await Supplier.find().lean();

  if (suppliers.length === 0) {
    logger.info("No suppliers found — creating three with realistic lead times.");
    suppliers = await Supplier.insertMany([
      { name: "Metro Wholesale", phone: "9810000001", email: "orders@metro.example", leadTimeDays: 3 },
      { name: "Kumar Distributors", phone: "9810000002", email: "sales@kumar.example", leadTimeDays: 7 },
      { name: "Sunrise Traders", phone: "9810000003", email: "hello@sunrise.example", leadTimeDays: 14 },
    ]);
  }

  let customers = await Customer.find().lean();

  if (customers.length === 0) {
    logger.info("No customers found — creating a handful of regulars plus a walk-in.");
    customers = await Customer.insertMany([
      { name: "Walk-in Customer", phone: "9820000000" },
      { name: "Anita Sharma", phone: "9820000001", email: "anita@example.com" },
      { name: "Rahul Verma", phone: "9820000002", email: "rahul@example.com" },
      { name: "Priya Nair", phone: "9820000003" },
      { name: "Imran Qureshi", phone: "9820000004" },
    ]);
  }

  return { suppliers, customers };
};

/**
 * Who recorded each movement.
 *
 * Spread across whatever accounts exist so the per-staff comparison in the
 * anomaly feed has more than one row to compare. Falls back to null — the field
 * is nullable — rather than refusing to seed on a database with no users.
 */
const getActors = async () => {
  const users = await User.find({ isActive: true }).select("_id name role").lean();

  if (users.length === 0) {
    logger.warn(
      "No user accounts found — movements will have no createdBy. Run `npm run seed:owner` first if you want staff attribution."
    );
    return [null];
  }

  return users.map((user) => user._id);
};

const pick = (array, index) => array[index % array.length];

const run = async () => {
  const uri = process.env.SEED_MONGO_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("Set MONGO_URI in .env, or SEED_MONGO_URI to target another database.");
  }

  // Say plainly which database is about to be written to. Writing months of
  // history into the wrong one is a bad afternoon.
  const isAtlas = uri.startsWith("mongodb+srv");
  logger.info(`Target: ${isAtlas ? "MongoDB Atlas (remote)" : "local MongoDB"}`);

  await mongoose.connect(uri);

  const products = await Product.find();

  if (products.length === 0) {
    throw new Error("No products in this database. Run `npm run seed` first.");
  }

  logger.info(`Generating ${DAYS} days of history for ${products.length} products.`);

  if (FRESH) {
    const { deletedCount } = await StockMovement.deleteMany({});
    logger.info(`--fresh: removed ${deletedCount} existing movements.`);
  }

  const { suppliers, customers } = await ensureCounterparties();
  const actors = await getActors();

  let buffer = [];
  let written = 0;
  let counter = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    // timestamps: false so the explicit backdated createdAt survives insertion —
    // without it Mongoose overwrites it and every movement lands today.
    await StockMovement.insertMany(buffer, { timestamps: false });
    written += buffer.length;
    buffer = [];
  };

  for (const product of products) {
    const sales = generateDailyDemand(product.sku, DAYS);

    if (sales.length === 0) {
      logger.warn(`${product.name}: generator produced no sales, skipping.`);
      continue;
    }

    const restocks = generateRestocks(product.sku, sales, DAYS);

    // Merge and replay chronologically so prevQuantity/newQuantity chain
    // correctly — the ledger has to add up, not just exist.
    const events = [
      ...restocks.map((r) => ({ ...r, type: "PURCHASE" })),
      ...sales.map((s) => ({ ...s, type: "SALE" })),
    ].sort((a, b) => a.date - b.date);

    let stock = 0;

    for (const event of events) {
      const prevQuantity = stock;

      if (event.type === "PURCHASE") {
        stock += event.quantity;
      } else {
        // Never let the ledger go negative; skip a sale the shop could not have
        // made rather than writing an impossible row.
        if (stock < event.quantity) continue;
        stock -= event.quantity;
      }

      counter += 1;

      buffer.push({
        product: product._id,
        type: event.type,
        quantity: event.quantity,
        unitPrice:
          event.type === "PURCHASE"
            ? product.purchasePrice
            : // A little price variation on sales, so discount detection has
              // something real to look at rather than a perfectly uniform ledger.
              counter % 37 === 0
              ? Math.round(product.sellingPrice * 0.75)
              : product.sellingPrice,
        prevQuantity,
        newQuantity: stock,
        createdBy: pick(actors, counter),
        ...(event.type === "PURCHASE"
          ? { supplier: pick(suppliers, counter)._id }
          : { customer: pick(customers, counter)._id }),
        createdAt: event.date,
        updatedAt: event.date,
      });

      if (buffer.length >= BATCH_SIZE) await flush();
    }

    // The product's stock must match where the replay ended, or the reorder
    // maths reads a figure the ledger disagrees with.
    product.quantity = stock;
    await product.save();
  }

  await flush();

  const oldest = await StockMovement.findOne().sort({ createdAt: 1 }).select("createdAt").lean();

  logger.info(`Wrote ${written} movements.`);
  logger.info(
    `History now runs from ${oldest ? oldest.createdAt.toISOString().slice(0, 10) : "—"} to today.`
  );
  logger.info("The Forecast and Reorder Plan pages should have something to say now.");
};

run()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
