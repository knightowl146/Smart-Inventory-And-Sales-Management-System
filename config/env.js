const { cleanEnv, str, port } = require('envalid');

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  MONGO_URI: str({ devDefault: 'mongodb://localhost:27017/inventorydb' }), // required in production, defaults locally for dev/test
  GEMINI_API_KEY: str({ default: '' }), // Optional

  // Comma-separated list of allowed frontend origins, e.g. "https://app.example.com,https://admin.example.com"
  // Left empty in development (falls back to allow-all so local Vite ports just work).
  // Required to be set explicitly in production - see app.js.
  CORS_ORIGIN: str({ default: '' }),
});

module.exports = env;