'use strict';

/**
 * Creates standardized, fail-closed route guard helpers.
 * If authorizeMiddleware or the required method is unavailable, requests fail closed with HTTP 500.
 */
function createGuardHelpers(authorizeMiddleware) {
  const requirePermission = (permission) => {
    if (!authorizeMiddleware || typeof authorizeMiddleware.requirePermission !== 'function') {
      return (req, res) => res.status(500).json({
        error: {
          code: 'AUTHORIZATION_CONFIG_ERROR',
          message: 'Authorization subsystem unavailable',
          requestId: req.id
        }
      });
    }
    return authorizeMiddleware.requirePermission(permission);
  };

  const requireRole = (role) => {
    if (!authorizeMiddleware || typeof authorizeMiddleware.requireRole !== 'function') {
      return (req, res) => res.status(500).json({
        error: {
          code: 'AUTHORIZATION_CONFIG_ERROR',
          message: 'Authorization subsystem unavailable',
          requestId: req.id
        }
      });
    }
    return authorizeMiddleware.requireRole(role);
  };

  return { requirePermission, requireRole };
}

module.exports = {
  createGuardHelpers
};
