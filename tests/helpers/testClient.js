const supertest = require("supertest");
const User = require("../../models/User");
const { signAccessToken } = require("../../services/tokenService");

/**
 * Authenticated test client.
 *
 * Every endpoint now requires a token, so the existing suites - which were
 * written against an open API - would all fail at the first request. Rather
 * than add `.set("Authorization", ...)` to 500-odd call sites, each suite
 * imports `request` from here instead of straight from supertest and calls
 * `seedTestUsers()` once after connecting. `request(app)` then behaves exactly
 * as before, with an owner token attached.
 *
 * The role-specific clients are what the RBAC suite uses to prove the guards
 * actually do something:
 *
 *   asOwner(app).get("/api/analytics/profit-loss")     -> 200
 *   asEmployee(app).get("/api/analytics/profit-loss")  -> 403
 *   anonymous(app).get("/api/products")                -> 401
 */

const TEST_PASSWORD = "test-password-123";

const state = {
  owner: null,
  employee: null,
  ownerToken: null,
  employeeToken: null,
  defaultToken: null,
};

const seedTestUsers = async () => {
  const owner = new User({
    name: "Test Owner",
    email: "owner@test.local",
    role: "owner",
  });
  await owner.setPassword(TEST_PASSWORD);
  await owner.save();

  const employee = new User({
    name: "Test Employee",
    email: "employee@test.local",
    role: "employee",
    createdBy: owner._id,
  });
  await employee.setPassword(TEST_PASSWORD);
  await employee.save();

  state.owner = owner;
  state.employee = employee;
  state.ownerToken = signAccessToken(owner);
  state.employeeToken = signAccessToken(employee);
  state.defaultToken = state.ownerToken;

  return state;
};

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const client = (app, token) => {
  const agent = supertest(app);
  const wrapper = {};

  for (const method of METHODS) {
    wrapper[method] = (url) => {
      const test = agent[method](url);
      return token ? test.set("Authorization", `Bearer ${token}`) : test;
    };
  }

  return wrapper;
};

const request = (app) => client(app, state.defaultToken);
const asOwner = (app) => client(app, state.ownerToken);
const asEmployee = (app) => client(app, state.employeeToken);
const anonymous = (app) => client(app, null);
const withToken = (app, token) => client(app, token);

module.exports = {
  TEST_PASSWORD,
  state,
  seedTestUsers,
  request,
  asOwner,
  asEmployee,
  anonymous,
  withToken,
};
