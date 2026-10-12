'use strict';

/**
 * In-memory sliding window rate limiter
 */
function createRateLimiter({ windowMs, maxRequests, message = 'Too many requests, please try again later.' }) {
  const hits = new Map(); // key -> [timestamps]

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, Math.max(windowMs, 60000)).unref();

  return function rateLimiterMiddleware(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    let timestamps = hits.get(key) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - timestamps[0])) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          requestId: req.id
        }
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = createRateLimiter;
