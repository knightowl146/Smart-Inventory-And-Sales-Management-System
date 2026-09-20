require("dotenv").config();

const { execFileSync } = require("child_process");
const mongoose = require("mongoose");
const logger = require("./utils/logger");
const User = require("./models/User");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");
const Customer = require("./models/Customer");
const Supplier = require("./models/Supplier");
const AuditLog = require("./models/AuditLog");
const Briefing = require("./models/Briefing");
const AiCall = require("./models/AiCall");

/**
 * Rebuild the demo database from scratch.
 *
 * A portfolio link that anyone can open is a portfolio link anyone can empty.
 * Someone will delete every product, or rename them all to something unhelpful,
 * and the next person to follow the link from a CV sees a broken app. This puts
 * it back.
 *
 * Meant for a nightly cron:
 *
 *   0 2 * * *  cd /app && npm run reset:demo
 *
 * Guarded, because running it against real data would be a catastrophe: it
 * refuses to run unless DEMO_MODE=true is explicitly set, and it will not touch
 * a database whose URI does not look like a demo one unless
 * DEMO_RESET_CONFIRM=true is also set.
 *
 * Demo accounts are created from DEMO_OWNER_EMAIL / DEMO_OWNER_PASSWORD and
 * DEMO_EMPLOYEE_EMAIL / DEMO_EMPLOYEE_PASSWORD, which are the same values you
 * put in Vercel as VITE_DEMO_OWNER / VITE_DEMO_EMPLOYEE so the login page can
 * display them.
 */

const HISTORY_DAYS = Number(process.env.DEMO_HISTORY_DAYS || 180);

const requireEnv = (name, fallback) => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} must be set to reset the demo.`);
  return value;
};

const looksLikeDemo = (uri) => /demo|sandbox|staging|preview/i.test(uri);

const run = async () => {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error(
      "Refusing to run: set DEMO_MODE=true to confirm this database is a disposable demo."
    );
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");

  if (!looksLikeDemo(uri) && process.env.DEMO_RESET_CONFIRM !== "true") {
    throw new Error(
      'This database name does not look like a demo one. If you are certain, set DEMO_RESET_CONFIRM=true. This deletes every product, movement, customer, supplier and user.'
    );
  }

  const ownerEmail = requireEnv("DEMO_OWNER_EMAIL", "owner@demo.local");
  const ownerPassword = requireEnv("DEMO_OWNER_PASSWORD");
  const employeeEmail = requireEnv("DEMO_EMPLOYEE_EMAIL", "staff@demo.local");
  const employeePassword = requireEnv("DEMO_EMPLOYEE_PASSWORD");

  await mongoose.connect(uri);
  logger.info("Connected. Clearing demo data…");

  // Order does not matter - there are no cascading constraints - but clearing
  // movements first keeps the intermediate state coherent if this is
  // interrupted halfway.
  await StockMovement.deleteMany({});
  await Product.deleteMany({});
  await Customer.deleteMany({});
  await Supplier.deleteMany({});
  await AuditLog.deleteMany({});
  await Briefing.deleteMany({});
  await AiCall.deleteMany({});
  await User.deleteMany({});

  logger.info("Recreating demo accounts…");

  const owner = new User({ name: "Demo Owner", email: ownerEmail, role: "owner" });
  await owner.setPassword(ownerPassword);
  await owner.save();

  const employee = new User({
    name: "Demo Employee",
    email: employeeEmail,
    role: "employee",
    createdBy: owner._id,
  });
  await employee.setPassword(employeePassword);
  await employee.save();

  // A second employee, so the staff comparison in the anomaly feed has enough
  // rows to compare - it needs three actors before "unlike the others" means
  // anything, and the owner counts as the third.
  const secondEmployee = new User({
    name: "Demo Employee 2",
    email: employeeEmail.replace("@", "2@"),
    role: "employee",
    createdBy: owner._id,
  });
  await secondEmployee.setPassword(employeePassword);
  await secondEmployee.save();

  await mongoose.disconnect();

  // The catalogue and history seeders are separate scripts with their own
  // connection handling. Shelling out keeps one implementation of each rather
  // than a second copy that drifts.
  logger.info("Seeding catalogue…");
  // --yes: seedElectronics asks before deleting, and there is nobody at the
  // keyboard here. The confirmation this script already obtained covers it.
  execFileSync(process.execPath, ["seedElectronics.js", "--yes"], { stdio: "inherit" });

  logger.info(`Seeding ${HISTORY_DAYS} days of trading history…`);
  execFileSync(process.execPath, ["seedHistory.js", `--days=${HISTORY_DAYS}`, "--fresh"], {
    stdio: "inherit",
  });

  logger.info("Demo reset complete.");
  logger.info(`  owner:    ${ownerEmail}`);
  logger.info(`  employee: ${employeeEmail}`);
};

run().catch(async (err) => {
  logger.error(err.message);
  process.exitCode = 1;

  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
