'use strict';

const Joi = require('joi');

const createAssetSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  displayName: Joi.string().max(255).allow('', null).optional(),
  type: Joi.string().min(1).max(100).default('REPOSITORY'),
  criticality: Joi.string().min(1).max(50).default('TIER_3_MEDIUM'),
  environment: Joi.string().min(1).max(50).default('PRODUCTION'),
  internetFacing: Joi.boolean().default(false),
  exposure: Joi.string().allow('', null).optional(),
  ipAddress: Joi.string().allow('', null).optional(),
  hostname: Joi.string().allow('', null).optional(),
  projectId: Joi.string().allow('', null).optional(),
  projectName: Joi.string().allow('', null).optional(),
  owner: Joi.alternatives().try(
    Joi.string().allow('', null),
    Joi.object({
      email: Joi.string().email().allow('', null).optional(),
      teamId: Joi.string().allow('', null).optional(),
      businessUnit: Joi.string().allow('', null).optional()
    })
  ).optional(),
  identifiers: Joi.array().items(Joi.string()).optional(),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.object().pattern(Joi.string(), Joi.string())
  ).optional()
});

const updateAssetSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  displayName: Joi.string().max(255).allow('', null).optional(),
  type: Joi.string().min(1).max(100).optional(),
  criticality: Joi.string().min(1).max(50).optional(),
  environment: Joi.string().min(1).max(50).optional(),
  internetFacing: Joi.boolean().optional(),
  exposure: Joi.string().allow('', null).optional(),
  ipAddress: Joi.string().allow('', null).optional(),
  hostname: Joi.string().allow('', null).optional(),
  projectId: Joi.string().allow('', null).optional(),
  projectName: Joi.string().allow('', null).optional(),
  owner: Joi.alternatives().try(
    Joi.string().allow('', null),
    Joi.object({
      email: Joi.string().email().allow('', null).optional(),
      teamId: Joi.string().allow('', null).optional(),
      businessUnit: Joi.string().allow('', null).optional()
    })
  ).optional(),
  identifiers: Joi.array().items(Joi.string()).optional(),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.object().pattern(Joi.string(), Joi.string())
  ).optional(),
  isActive: Joi.boolean().optional()
}).min(1);

const AssetValidator = {
  validateCreateAsset(req, res, next) {
    const { error, value } = createAssetSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    req.body = value;
    next();
  },

  validateUpdateAsset(req, res, next) {
    const { error, value } = updateAssetSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    req.body = value;
    next();
  }
};

module.exports = AssetValidator;
