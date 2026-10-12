'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CacheService } = require('../../src/infrastructure/cache/redis-cache');

describe('Cache Service & Tenant Scoping (ADR-010)', () => {
  it('should enforce tenant isolation in key building', () => {
    const cache = new CacheService({ enabled: true });
    const key = cache.buildTenantKey('tenant_123', 'session', 'tok_abc');
    assert.equal(key, 'tenant:tenant_123:session:tok_abc');

    assert.throws(() => {
      cache.buildTenantKey(null, 'session', 'tok_abc');
    }, /tenantId is required/);
  });

  it('should set, get, and delete keys with memory fallback', async () => {
    const cache = new CacheService({ enabled: true });
    const key = cache.buildTenantKey('tenant_test', 'dashboard', 'summary');

    await cache.set(key, { openFindings: 42, score: 78 }, 60);

    const retrieved = await cache.get(key);
    assert.deepEqual(retrieved, { openFindings: 42, score: 78 });

    await cache.del(key);
    const afterDel = await cache.get(key);
    assert.equal(afterDel, null);
  });

  it('should wrap expensive calculations with cache fallback', async () => {
    const cache = new CacheService({ enabled: true });
    const key = cache.buildTenantKey('tenant_test', 'agg', 'heavy_report');

    let computeCount = 0;
    const compute = async () => {
      computeCount++;
      return { computedAt: 12345, count: 100 };
    };

    const first = await cache.wrap(key, 60, compute);
    const second = await cache.wrap(key, 60, compute);

    assert.equal(computeCount, 1);
    assert.deepEqual(first, second);
  });
});
