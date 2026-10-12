'use strict';

const logger = require('../../observability/logger');

class MemoryCacheFallback {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  get(key) {
    const expiresAt = this.ttls.get(key);
    if (expiresAt && Date.now() > expiresAt) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    const item = this.store.get(key);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  set(key, value, ttlSeconds = 300) {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
    if (ttlSeconds) {
      this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    }
  }

  del(key) {
    this.store.delete(key);
    this.ttls.delete(key);
  }

  delPattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.del(key);
      }
    }
  }

  clear() {
    this.store.clear();
    this.ttls.clear();
  }
}

class CacheService {
  constructor({ redisClient = null, redisUrl = process.env.REDIS_URL, enabled = true } = {}) {
    this.enabled = enabled;
    this.redisClient = redisClient;
    this.memoryFallback = new MemoryCacheFallback();
    this.isRedisConnected = false;

    if (this.enabled && !this.redisClient && redisUrl) {
      try {
        const Redis = require('ioredis');
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000))
        });

        this.redisClient.on('connect', () => {
          this.isRedisConnected = true;
          logger.info('Connected to Redis cache server');
        });

        this.redisClient.on('error', (err) => {
          this.isRedisConnected = false;
          logger.debug?.('Redis cache error, using in-memory fallback', { error: err.message });
        });
      } catch (err) {
        logger.debug?.('ioredis initialization skipped, using in-memory cache', { error: err.message });
      }
    }
  }

  buildTenantKey(tenantId, namespace, id) {
    if (!tenantId) throw new Error('CacheService: tenantId is required for tenant keys');
    return `tenant:${tenantId}:${namespace}:${id}`;
  }

  buildPlatformKey(namespace, id) {
    return `platform:${namespace}:${id}`;
  }

  async get(key) {
    if (!this.enabled || !key) return null;

    if (this.isRedisConnected && this.redisClient) {
      try {
        const raw = await this.redisClient.get(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return this.memoryFallback.get(key);
      }
    }

    return this.memoryFallback.get(key);
  }

  async set(key, value, ttlSeconds = 300) {
    if (!this.enabled || !key) return;

    if (this.isRedisConnected && this.redisClient) {
      try {
        const stringified = JSON.stringify(value);
        if (ttlSeconds) {
          await this.redisClient.set(key, stringified, 'EX', ttlSeconds);
        } else {
          await this.redisClient.set(key, stringified);
        }
        return;
      } catch (err) {
        // Fall back to memory
      }
    }

    this.memoryFallback.set(key, value, ttlSeconds);
  }

  async del(key) {
    if (!key) return;

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        // Fall back
      }
    }

    this.memoryFallback.del(key);
  }

  async delPattern(pattern) {
    if (!pattern) return;

    if (this.isRedisConnected && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (keys && keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (err) {
        // Fall back
      }
    }

    this.memoryFallback.delPattern(pattern);
  }

  async wrap(key, ttlSeconds, computeFn) {
    const cached = await this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    const fresh = await computeFn();
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  async disconnect() {
    if (this.redisClient && typeof this.redisClient.quit === 'function') {
      try {
        await this.redisClient.quit();
      } catch (e) {
        // Ignore during shutdown
      }
    }
  }

  isHealthy() {
    return {
      status: this.isRedisConnected ? 'UP' : 'IN_MEMORY_FALLBACK',
      type: this.isRedisConnected ? 'REDIS' : 'MEMORY'
    };
  }
}

const defaultCacheService = new CacheService();

module.exports = {
  CacheService,
  cacheService: defaultCacheService,
  MemoryCacheFallback
};
