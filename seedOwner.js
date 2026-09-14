require("dotenv").config();

const mongoose = require("mongoose");
const env = require("./config/env");
const connectDB = require("./config/db");
const User = require("./models/User");
const logger = require("./utils/logger");

/**
 * Creates the first owner account.
 *
 * This is the only way an account comes into existence without an existing
 * owner: there is no public registration endpoint anywhere in the API, so the
 * chicken-and-egg problem is solved here, once, from environment variables that
 * never reach the running server.
 *
 * Idempotent - running it again against an existing owner does nothing except
 * optionally reset that owner's password when RESET_OWNER_PASSWORD=true.
 *
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='a long passphrase' \
 *     npm run seed:owner
 */
const seedOwner = async () => {
  const email = env.OWNER_EMAIL.toLowerCase().trim();
  const password = env.OWNER_PASSWORD;

  if (!email || !password) {
    logger.error(
      "OWNER_EMAIL and OWNER_PASSWORD must be set (in .env or on the command line) to seed the first owner."
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < User.MIN_PASSWORD_LENGTH) {
    logger.error(
      `OWNER_PASSWORD must be at least ${User.MIN_PASSWORD_LENGTH} characters.`
    );
    process.exitCode = 1;
    return;
  }

  await connectDB();

  const existing = await User.findOne({ email }).select("+passwordHash +sessions");

  if (existing) {
    if (process.env.RESET_OWNER_PASSWORD === "true") {
      await existing.setPassword(password);
      existing.role = "owner";
      existing.isActive = true;
      existing.sessions = [];
      existing.tokenVersion += 1; // invalidates any token issued under the old password
      await existing.save();
      logger.info(`Reset password for existing owner ${email}.`);
    } else {
      logger.info(
        `An account already exists for ${email}. Set RESET_OWNER_PASSWORD=true to reset its password.`
      );
    }
    return;
  }

  const ownerCount = await User.countDocuments({ role: "owner" });

  if (ownerCount > 0) {
    logger.warn(
      `${ownerCount} owner account(s) already exist. Creating an additional owner ${email} - if this was not intended, delete it from the Users page.`
    );
  }

  const owner = new User({ name: env.OWNER_NAME, email, role: "owner" });
  await owner.setPassword(password);
  await owner.save();

  logger.info(`Created owner account ${email}.`);
};

seedOwner()
  .catch((err) => {
    logger.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
