require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");

/**
 * Say exactly which database this is, and what is in it.
 *
 * "I seeded it and nothing changed" is nearly always two databases: the URI in
 * .env and the one the deployed backend uses differ by a cluster, or - far more
 * often - by the database NAME, which lives in the path of the connection
 * string and is easy to leave off. A mongodb+srv URI with no database name
 * silently connects to one called "test", so the seed really did run, really
 * did write 76 products, and wrote them somewhere nothing reads.
 *
 * This prints the host, the database name, and the counts, so the two sides can
 * be compared instead of guessed at.
 *
 *   node checkDb.js
 *   SEED_MONGO_URI="mongodb+srv://..." node checkDb.js    # check another one
 */

const run = async () => {
  const uri = process.env.SEED_MONGO_URI || process.env.MONGO_URI;

  if (!uri) throw new Error("No MONGO_URI or SEED_MONGO_URI set.");

  await mongoose.connect(uri);

  const connection = mongoose.connection;

  // The database name is the part everyone forgets is even in the URI.
  const fromUri = uri.split("/").pop().split("?")[0];

  console.log("");
  console.log("  host        ", connection.host || "(srv)");
  console.log("  database    ", connection.name);
  console.log("  name in URI ", fromUri || "(none - so Mongo used the default)");
  console.log("");

  const [products, movements] = await Promise.all([
    Product.countDocuments(),
    StockMovement.countDocuments(),
  ]);

  console.log("  products    ", products);
  console.log("  movements   ", movements);

  const sample = await Product.find().select("name sku category").limit(5).lean();
  console.log("");
  console.log("  first five products:");
  for (const item of sample) {
    console.log(`    ${item.sku}  ${item.name}  (${item.category})`);
  }

  const newest = await StockMovement.findOne().sort({ createdAt: -1 }).select("createdAt").lean();
  const oldest = await StockMovement.findOne().sort({ createdAt: 1 }).select("createdAt").lean();

  console.log("");
  console.log(
    "  movements run from",
    oldest ? oldest.createdAt.toISOString().slice(0, 10) : "-",
    "to",
    newest ? newest.createdAt.toISOString().slice(0, 10) : "-"
  );

  // Every other database on this cluster, with its collections. If the
  // electronics products are on the cluster but not in the database the app
  // reads, this is where they will show up.
  const admin = connection.db.admin();

  try {
    const { databases } = await admin.listDatabases();
    console.log("");
    console.log("  databases on this cluster:");

    for (const database of databases) {
      if (["admin", "local", "config"].includes(database.name)) continue;

      const collections = await connection.client
        .db(database.name)
        .listCollections()
        .toArray();

      const counts = [];
      for (const collection of collections) {
        if (!/product|stockmovement/i.test(collection.name)) continue;
        const count = await connection.client.db(database.name).collection(collection.name).countDocuments();
        counts.push(`${collection.name}=${count}`);
      }

      console.log(`    ${database.name}${counts.length ? "  " + counts.join("  ") : ""}`);
    }
  } catch {
    // Atlas shared tiers deny listDatabases. Not important enough to fail over.
    console.log("");
    console.log("  (this user cannot list databases - skipping the cluster survey)");
  }

  console.log("");
};

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
