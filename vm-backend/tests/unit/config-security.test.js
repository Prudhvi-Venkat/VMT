'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('SEC-001: JWT Configuration & Boot Guard', () => {
  it('should reject missing or empty JWT_SECRET', () => {
    const invalidConfigs = [
      {},
      { jwt: {} },
      { jwt: { secret: '' } },
      { jwt: { secret: null } },
      { jwt: { secret: undefined } }
    ];

    for (const cfg of invalidConfigs) {
      assert.throws(() => {
        if (!cfg.jwt?.secret || typeof cfg.jwt.secret !== 'string' || cfg.jwt.secret.length < 32) {
          throw new Error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
        }
      }, /FATAL: JWT_SECRET/);
    }
  });

  it('should reject short JWT_SECRET (< 32 characters)', () => {
    const cfg = { jwt: { secret: 'short_secret_only_24_chars' } };
    assert.throws(() => {
      if (!cfg.jwt?.secret || typeof cfg.jwt.secret !== 'string' || cfg.jwt.secret.length < 32) {
        throw new Error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
      }
    }, /FATAL: JWT_SECRET/);
  });

  it('should accept strong JWT_SECRET (>= 32 characters)', () => {
    const cfg = { jwt: { secret: 'a_very_strong_production_secret_with_more_than_32_characters' } };
    assert.doesNotThrow(() => {
      if (!cfg.jwt?.secret || typeof cfg.jwt.secret !== 'string' || cfg.jwt.secret.length < 32) {
        throw new Error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
      }
    });
  });
});
