'use strict';

const logger = require('../observability/logger');

function errorHandlerMiddleware(err, req, res, next) {
  const statusCode = err.statusCode || (err.status || 500);
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = statusCode === 500 ? 'An internal error occurred' : (err.message || 'Error processing request');

  logger.error('Request failed with error', {
    error: err.message,
    code: errorCode,
    statusCode,
    path: req.path,
    method: req.method,
    requestId: req.id,
    correlationId: req.correlationId
  });

  const responsePayload = {
    error: {
      code: errorCode,
      message,
      requestId: req.id
    }
  };

  if (err.details) {
    responsePayload.error.details = err.details;
  }

  res.status(statusCode).json(responsePayload);
}

module.exports = errorHandlerMiddleware;
