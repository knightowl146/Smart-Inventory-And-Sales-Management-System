require("dotenv").config();

const mongoose = require("mongoose");
const readline = require("readline");
const logger = require("./utils/logger");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");
const { buildCatalogue } = require("./services/seed/electronicsCatalogue");

/**
 * Replace the catalogue with a generic electronics shop.
 *
 * Destructive by design: it deletes every product and every stock movement
 * before inserting, because a half-replaced catalogue is worse than either
 * one. Movements go first - a movement whose product has been deleted is an
 * orphan row that quietly breaks every aggregation that joins the two.
 *
 * This writes no history. Run seed:history afterwards to generate the ledger,
 * which also sets each product's closing stock:
 *
 *   npm run seed:electronics
 *   npm run seed:history -- --fresh --days=180
 *
 * Against Atlas without editing .env - SEED_MONGO_URI wins over MONGO_URI:
 *
 *   PowerShell:  $env:SEED_MONGO_URI="mongodb+srv://..."; npm run seed:electronics
 *   bash:        SEED_MONGO_URI="mongodb+srv://..." npm run seed:electronics
 *
 * Pass --yes to skip the confirmation prompt (for CI or a scripted reset).
 */

const SKIP_PROMPT = process.argv.includes("--yes") || process.argv.includes("-y");

/**
 * Ask before deleting, unless told not to.
 *
 * The one thing this script must never do is wipe a database the person
 * running it did not mean to point at - which is exactly the failure mode of
 * an environment variable that silently still holds last week's Atlas URI.
 */
const confirm = (question) =>
  new Promise((resolve) => {
    if (SKIP_PROMPT) return resolve(true);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question(`${question} (yes/no) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });

const run = async () => {
  const uri = process.env.SEED_MONGO_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("Set MONGO_URI in .env, or SEED_MONGO_URI to target another database.");
  }

  const isAtlas = uri.startsWith("mongodb+srv");
  logger.info(`Target: ${isAtlas ? "MongoDB Atlas (remote)" : "local MongoDB"}`);

  await mongoose.connect(uri);

  const [existingProducts, existingMovements] = await Promise.all([
    Product.countDocuments(),
    StockMovement.countDocuments(),
  ]);

  logger.warn(
    `About to delete ${existingProducts} products and ${existingMovements} stock movements from ${
      isAtlas ? "ATLAS" : "the local database"
    }.`
  );

  const proceed = await confirm("Delete them and install the electronics catalogue?");

  if (!proceed) {
    logger.info("Cancelled. Nothing was deleted.");
    return;
  }

  // Movements first: deleting products first would leave rows pointing at
  // documents that no longer exist, and the reports join on that reference.
  const movements = await StockMovement.deleteMany({});
  const products = await Product.deleteMany({});

  logger.info(`Deleted ${movements.deletedCount} movements and ${products.deletedCount} products.`);

  const catalogue = buildCatalogue();

  // Guards against a duplicated SKU slipping into the table above - insertMany
  // would report it as a cryptic duplicate-key error halfway through.
  const skus = new Set(catalogue.map((item) => item.sku));
  if (skus.size !== catalogue.length) {
    throw new Error("Duplicate SKU in the electronics catalogue - fix electronicsCatalogue.js.");
  }

  const inserted = await Product.insertMany(catalogue);

  const categories = [...new Set(inserted.map((item) => item.category))];
  const prices = inserted.map((item) => item.sellingPrice);

  logger.info(`Inserted ${inserted.length} products across ${categories.length} categories.`);
  logger.info(`Categories: ${categories.join(", ")}`);
  logger.info(
    `Selling prices run from Rs ${Math.min(...prices).toLocaleString("en-IN")} to Rs ${Math.max(
      ...prices
    ).toLocaleString("en-IN")}.`
  );
  logger.info("");
  logger.info("Every product is at zero stock. Next, generate the trading history:");
  logger.info("  npm run seed:history -- --fresh --days=180");
};

run()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
