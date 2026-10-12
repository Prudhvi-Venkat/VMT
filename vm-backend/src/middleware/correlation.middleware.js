'use strict';

const crypto = require('crypto');

function correlationMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const correlationId = req.headers['x-correlation-id'] || requestId;

  req.id = requestId;
  req.correlationId = correlationId;

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  next();
}

module.exports = correlationMiddleware;
