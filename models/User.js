const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Cost factor for bcrypt. 12 is the usual production floor in 2026 - high
 * enough that an offline attacker gets a few thousand guesses per second per
 * core, low enough that a login still feels instant.
 *
 * Note on the library choice: this uses `bcryptjs` (pure JavaScript) rather
 * than `bcrypt` (native addon). Both implement the same algorithm; bcryptjs is
 * roughly 30% slower but needs no compiler, which means `npm ci` can never fail
 * on Render's build image or on a Windows machine without MSVC build tools.
 * For a deployment this size that tradeoff is worth more than the speed.
 * Argon2id is the stronger modern choice, but it is a native addon with the
 * same build-tooling problem.
 */
const BCRYPT_ROUNDS = 12;

/**
 * One live refresh token. Storing the token's `jti` (and only the jti - never
 * the token itself) is what makes rotation with reuse detection possible:
 * refreshing swaps this entry for a new one, so if an old refresh token is ever
 * replayed its jti will no longer be in the array and we know the token leaked.
 */
const sessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },

    /**
     * `select: false` means the hash is never loaded unless a query explicitly
     * asks for it. A controller that forgets to project it cannot leak it.
     */
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["owner", "employee"],
      default: "employee",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /**
     * Baked into every token. Bumping it invalidates every access and refresh
     * token this user holds, everywhere, immediately - which is how
     * deactivation and "log out of all devices" work without a token blocklist.
     */
    tokenVersion: {
      type: Number,
      default: 0,
    },

    sessions: {
      type: [sessionSchema],
      default: [],
      select: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
};

userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  if (!this.passwordHash) {
    // Guards against a query that forgot `.select("+passwordHash")` silently
    // comparing against undefined and throwing deep inside bcrypt.
    return Promise.resolve(false);
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Belt and braces on top of `select: false` - even if something does load the
 * hash or the session list, serialising the document drops them.
 */
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.sessions;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.MIN_PASSWORD_LENGTH = 8;
userSchema.statics.BCRYPT_ROUNDS = BCRYPT_ROUNDS;

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
