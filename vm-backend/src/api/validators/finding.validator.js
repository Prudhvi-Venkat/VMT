'use strict';

const Joi = require('joi');
const { FindingStatus } = require('../../domain/entities/scan-finding.entity');

const validStatuses = [...Object.values(FindingStatus), 'REOPENED', 'REMEDIATED', 'CLOSED'];

const updateStatusSchema = Joi.object({
  status: Joi.string().valid(...validStatuses).insensitive().required(),
  reason: Joi.string().max(1000).allow('', null).optional(),
  comment: Joi.string().max(2000).allow('', null).optional()
});

const assignFindingSchema = Joi.object({
  assignedTo: Joi.string().min(1).max(100).required(),
  assignedUserName: Joi.string().max(100).allow('', null).optional()
});

const FindingValidator = {
  validateUpdateStatus(req, res, next) {
    const { error, value } = updateStatusSchema.validate(req.body, { abortEarly: false });
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
    const upper = (value.status || '').toUpperCase();
    if (upper === 'REMEDIATED' || upper === 'CLOSED') {
      value.status = 'RESOLVED';
    } else {
      value.status = upper;
    }
    req.body = value;
    next();
  },

  validateAssignFinding(req, res, next) {
    const { error, value } = assignFindingSchema.validate(req.body, { abortEarly: false });
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

module.exports = FindingValidator;
