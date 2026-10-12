'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} = require('../../src/domain/errors');
const TenantValidator = require('../../src/api/validators/tenant.validator');
const AssetValidator = require('../../src/api/validators/asset.validator');
const FindingValidator = require('../../src/api/validators/finding.validator');

describe('Domain Errors & Input Validation Hardening', () => {
  it('should instantiate categorized domain errors with correct HTTP status codes', () => {
    const valErr = new ValidationError('Invalid email format', [{ field: 'email' }]);
    assert.equal(valErr.statusCode, 400);
    assert.equal(valErr.code, 'VALIDATION_ERROR');

    const authErr = new UnauthorizedError();
    assert.equal(authErr.statusCode, 401);
    assert.equal(authErr.code, 'UNAUTHORIZED');

    const forbErr = new ForbiddenError();
    assert.equal(forbErr.statusCode, 403);
    assert.equal(forbErr.code, 'FORBIDDEN');

    const notFoundErr = new NotFoundError('Asset not found');
    assert.equal(notFoundErr.statusCode, 404);
    assert.equal(notFoundErr.code, 'NOT_FOUND');

    const conflictErr = new ConflictError('Tenant already exists');
    assert.equal(conflictErr.statusCode, 409);
    assert.equal(conflictErr.code, 'CONFLICT');
  });

  it('TenantValidator: should reject invalid tenant payloads', () => {
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) {
        responseStatus = code;
        return {
          json(body) {
            responseBody = body;
          }
        };
      }
    };

    const req = {
      id: 'req_test_01',
      body: {
        tenantKey: 'invalid key with spaces',
        name: 'A'
      }
    };

    let nextCalled = false;
    TenantValidator.validateCreateTenant(req, res, () => { nextCalled = true; });

    assert.equal(responseStatus, 400);
    assert.equal(responseBody.error.code, 'VALIDATION_ERROR');
    assert.equal(nextCalled, false);
  });

  it('AssetValidator: should accept valid asset payloads', () => {
    let nextCalled = false;
    const req = {
      body: {
        name: 'core-microservice',
        type: 'REPOSITORY',
        criticality: 'TIER_1_CRITICAL'
      }
    };
    const res = {};

    AssetValidator.validateCreateAsset(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('FindingValidator: should validate status updates', () => {
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(code) {
        responseStatus = code;
        return { json(b) { responseBody = b; } };
      }
    };

    const req = {
      id: 'req_finding_01',
      body: { status: 'INVALID_STATUS_NAME' }
    };

    let nextCalled = false;
    FindingValidator.validateUpdateStatus(req, res, () => { nextCalled = true; });

    assert.equal(responseStatus, 400);
    assert.equal(responseBody.error.code, 'VALIDATION_ERROR');
    assert.equal(nextCalled, false);
  });
});
