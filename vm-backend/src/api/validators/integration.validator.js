'use strict';

const Joi = require('joi');

const createIntegrationSchema = Joi.object({
  type: Joi.string().valid('GITHUB', 'GITLAB', 'AWS', 'AZURE', 'GCP', 'BITBUCKET', 'AWS_CODECOMMIT').insensitive().optional(),
  provider: Joi.string().valid('GITHUB', 'GITLAB', 'AWS', 'AZURE', 'GCP', 'BITBUCKET', 'AWS_CODECOMMIT').insensitive().optional(),
  name: Joi.string().min(2).max(100).optional(),
  displayName: Joi.string().min(2).max(100).optional(),
  projectId: Joi.string().allow('', null).optional(),
  credentials: Joi.object().optional(),
  config: Joi.object().optional()
}).or('type', 'provider').or('name', 'displayName');

const updateIntegrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  displayName: Joi.string().min(2).max(100).optional(),
  projectId: Joi.string().allow('', null).optional(),
  credentials: Joi.object().optional(),
  config: Joi.object().optional(),
  isActive: Joi.boolean().optional()
}).min(1);

const IntegrationValidator = {
  validateCreateIntegration(req, res, next) {
    const { error, value } = createIntegrationSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    const normalizedType = (value.type || value.provider || '').toUpperCase();
    value.type = normalizedType;
    value.provider = normalizedType;
    const normalizedName = value.name || value.displayName;
    value.name = normalizedName;
    value.displayName = normalizedName;
    value.credentials = value.credentials || {};
    value.config = value.config || {};
    req.body = value;
    next();
  },

  validateUpdateIntegration(req, res, next) {
    const { error, value } = updateIntegrationSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    if (value.name && !value.displayName) value.displayName = value.name;
    if (value.displayName && !value.name) value.name = value.displayName;
    req.body = value;
    next();
  }
};

module.exports = IntegrationValidator;
