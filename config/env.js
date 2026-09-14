const { cleanEnv, str, port, num } = require('envalid');

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  MONGO_URI: str({ devDefault: 'mongodb://localhost:27017/inventorydb' }), // required in production, defaults locally for dev/test
  GEMINI_API_KEY: str({ default: '' }), // Optional

  // Comma-separated list of allowed frontend origins, e.g. "https://app.example.com,https://admin.example.com"
  // Left empty in development (falls back to allow-all so local Vite ports just work).
  // Required to be set explicitly in production - see app.js.
  CORS_ORIGIN: str({ default: '' }),

  // ── Authentication ────────────────────────────────────────────────────────
  //
  // Two separate secrets so a leak of one cannot mint the other kind of token.
  // `devDefault` means these are optional locally but REQUIRED in production:
  // envalid refuses to start the server without them when NODE_ENV=production,
  // which is the behaviour we want. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  JWT_ACCESS_SECRET: str({ devDefault: 'dev-only-access-secret-do-not-use-in-production' }),
  JWT_REFRESH_SECRET: str({ devDefault: 'dev-only-refresh-secret-do-not-use-in-production' }),

  // Short access token; the client refreshes silently in the background.
  ACCESS_TOKEN_TTL: str({ default: '15m' }),
  REFRESH_TOKEN_TTL_DAYS: num({ default: 7 }),

  // First-owner bootstrap, read only by `npm run seed:owner`. Never used by the
  // running server, and there is no public sign-up route - every account after
  // the first is created by an owner from inside the app.
  OWNER_NAME: str({ default: 'Owner' }),
  OWNER_EMAIL: str({ default: '' }),
  OWNER_PASSWORD: str({ default: '' }),
});

// A production deploy that silently fell back to a published secret would be
// worse than one that refuses to boot.
if (env.NODE_ENV === 'production') {
  const weak = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ].filter(([, value]) => !value || value.startsWith('dev-only-') || value.length < 32);

  if (weak.length > 0) {
    throw new Error(
      `Refusing to start: ${weak
        .map(([name]) => name)
        .join(' and ')} must be set to a strong random value (32+ chars) in production.`
    );
  }
}

module.exports = env;
