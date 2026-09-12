const { cleanEnv, str, port } = require('envalid');

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  MONGO_URI: str({ devDefault: 'mongodb://localhost:27017/inventory-db' }), // required in production, defaults locally for dev/test
  GEMINI_API_KEY: str({ default: '' }), // Optional
});

module.exports = env;