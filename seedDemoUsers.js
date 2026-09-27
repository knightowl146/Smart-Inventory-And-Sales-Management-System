require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./models/User");
const logger = require("./utils/logger");

/**
 * Creates the public, read-only demo accounts, alongside the real ones.
 *
 * Reads DEMO_OWNER_EMAIL / DEMO_OWNER_PASSWORD and DEMO_EMPLOYEE_EMAIL /
 * DEMO_EMPLOYEE_PASSWORD - the same values that go into Vercel as
 * VITE_DEMO_OWNER and VITE_DEMO_EMPLOYEE ("email / password"), so the login
 * page's demo buttons sign in to accounts that exist:
 *
 *   npm run seed:demo-users
 *
 * Unlike `npm run reset:demo`, this deletes nothing: the real accounts and the
 * shop's data are left exactly as they are.
 *
 * SEED_MONGO_URI wins over MONGO_URI, to target Atlas without editing .env.
 *
 * What makes these safe to publish is on the server, not here: a demo account
 * cannot change any data (middlewares/demoGuard.js), has a daily AI allowance
 * (services/ai/demoAllowance.js), and sees other people's emails masked
 * (middlewares/responseFilter.js). This script only creates the accounts with
 * isDemo set.
 *
 * Safe to run again: an existing demo account gets the password given here.
 * It refuses to turn an existing real account into a demo one - publishing
 * that account's password would be the result.
 */

const ACCOUNTS = [
  { variable: "DEMO_OWNER", role: "owner", name: "Demo Owner" },
  { variable: "DEMO_EMPLOYEE", role: "employee", name: "Demo Employee" },
];

const credentialsFor = (variable) => {
  const email = (process.env[`${variable}_EMAIL`] || "").trim().toLowerCase();
  const password = process.env[`${variable}_PASSWORD`] || "";
  return email && password ? { email, password } : null;
};

const run = async () => {
  const wanted = ACCOUNTS.map((account) => ({
    ...account,
    credentials: credentialsFor(account.variable),
  })).filter((account) => account.credentials);

  if (wanted.length === 0) {
    throw new Error("Set DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD (and/or the DEMO_EMPLOYEE_ pair).");
  }

  for (const { variable, credentials } of wanted) {
    if (credentials.password.length < User.MIN_PASSWORD_LENGTH) {
      throw new Error(`${variable}_PASSWORD must be at least ${User.MIN_PASSWORD_LENGTH} characters.`);
    }
  }

  const uri = process.env.SEED_MONGO_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Set MONGO_URI in .env, or SEED_MONGO_URI to target another database.");

  logger.info(`Target: ${uri.startsWith("mongodb+srv") ? "MongoDB Atlas (remote)" : "local MongoDB"}`);
  await mongoose.connect(uri);

  for (const { role, name, credentials } of wanted) {
    const existing = await User.findOne({ email: credentials.email }).select("+passwordHash +sessions");

    if (existing && !existing.isDemo) {
      throw new Error(
        `${credentials.email} is a real account. Choose a different email for the demo - this one's password would become public.`
      );
    }

    const user = existing ?? new User({ email: credentials.email });
    user.name = name;
    user.role = role;
    user.isDemo = true;
    user.isActive = true;
    user.sessions = [];
    await user.setPassword(credentials.password);
    if (existing) user.tokenVersion += 1; // sign out anyone using the old password

    await user.save();
    logger.info(`${existing ? "Updated" : "Created"} read-only demo ${role}: ${credentials.email}`);
  }
};

run()
  .catch((err) => {
    logger.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
