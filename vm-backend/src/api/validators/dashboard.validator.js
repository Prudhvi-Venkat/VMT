'use strict';

const Joi = require('joi');

const dashboardQuerySchema = Joi.object({
  timeRange: Joi.string().valid('7d', '14d', '30d', '90d', '1y', 'all').optional(),
  range: Joi.string().valid('7d', '14d', '30d', '90d', '1y', 'all').optional(),
  projectId: Joi.string().allow('', null).optional(),
  tenantId: Joi.string().allow('', null).optional(),
  limit: Joi.number().integer().min(1).max(500).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

const DashboardValidator = {
  validateDashboardQuery(req, res, next) {
    const { error, value } = dashboardQuerySchema.validate(req.query, { abortEarly: false, allowUnknown: true });
    if (error) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details.map(d => d.message).join('; '),
          details: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
          requestId: req.id
        }
      });
    }
    if (value.timeRange && !value.range) {
      value.range = value.timeRange;
    } else if (value.range && !value.timeRange) {
      value.timeRange = value.range;
    }
    if (!value.range && !value.timeRange) {
      value.range = '30d';
      value.timeRange = '30d';
    }
    Object.assign(req.query, value);
    next();
  }
};

module.exports = DashboardValidator;
