"use strict";

/**
 * Cross-tree role contract test.
 *
 * Asserts that the roles offered by the tenant-admin "Access Role" picker are a
 * subset of the roles accepted by the backend createUserSchema validator. This
 * keeps the frontend provisioning enum from drifting ahead of the backend.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const backendValidatorPath = path.join(
  workspaceRoot,
  "vm-backend",
  "src",
  "api",
  "validators",
  "tenant.validator.js"
);
const adminDashboardPath = path.join(
  __dirname,
  "..",
  "components",
  "admin",
  "tenant-admin-dashboard.tsx"
);

function extractBackendRoles(source) {
  const roles = new Set();
  const validRe = /Joi\.string\(\)\.valid\(([^)]*)\)/g;
  let match;
  while ((match = validRe.exec(source)) !== null) {
    for (const quoted of match[1].matchAll(/'([A-Z_]+)'/g)) {
      roles.add(quoted[1]);
    }
  }
  return roles;
}

function extractUiRoleOptions(source) {
  const field = source.match(/label="Access Role"([\s\S]*?)<\/Field>/);
  assert.ok(field, 'Could not locate the "Access Role" field in tenant-admin-dashboard.tsx');
  return [...field[1].matchAll(/SelectItem value="([A-Z_]+)"/g)].map((m) => m[1]);
}

test("create-user role picker offers only roles the backend validator accepts", () => {
  assert.ok(fs.existsSync(backendValidatorPath), `Backend validator not found at ${backendValidatorPath}`);
  assert.ok(fs.existsSync(adminDashboardPath), `Tenant admin dashboard not found at ${adminDashboardPath}`);

  const backendRoles = extractBackendRoles(fs.readFileSync(backendValidatorPath, "utf8"));
  const uiRoles = extractUiRoleOptions(fs.readFileSync(adminDashboardPath, "utf8"));

  assert.ok(backendRoles.size > 0, "No backend roles were parsed from tenant.validator.js");
  assert.ok(uiRoles.length > 0, "No UI role options were parsed from tenant-admin-dashboard.tsx");
  assert.ok(
    uiRoles.includes("SECURITY_MANAGER"),
    "The SECURITY_MANAGER role must be selectable in the tenant admin UI"
  );

  const unknown = uiRoles.filter((role) => !backendRoles.has(role));
  assert.deepEqual(
    unknown,
    [],
    `UI role picker contains roles the backend rejects: ${unknown.join(", ")}`
  );
});
