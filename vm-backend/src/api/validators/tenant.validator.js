'use strict';

const Joi = require('joi');

const createTenantSchema = Joi.object({
  tenantKey: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(50).required(),
  name: Joi.string().min(2).max(100).required(),
  displayName: Joi.string().max(150).allow('', null).optional(),
  superAdminEmail: Joi.string().email({ tlds: { allow: false } }).required(),
  superAdminPassword: Joi.string().min(8).max(128).required(),
  superAdminName: Joi.string().max(100).allow('', null).optional(),
  superAdminFirstName: Joi.string().max(100).allow('', null).optional(),
  superAdminLastName: Joi.string().max(100).allow('', null).optional(),
  cloudProvider: Joi.string().max(100).allow('', null).optional(),
  complianceFramework: Joi.string().max(100).allow('', null).optional(),
  industry: Joi.string().max(100).allow('', null).optional(),
  environment: Joi.string().max(100).allow('', null).optional()
}).unknown(true);

const createUserSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().min(1).max(100).allow('', null).optional(),
  firstName: Joi.string().max(100).allow('', null).optional(),
  lastName: Joi.string().max(100).allow('', null).optional(),
  title: Joi.string().max(100).allow('', null).optional(),
  employeeId: Joi.string().max(100).allow('', null).optional(),
  department: Joi.string().max(100).allow('', null).optional(),
  role: Joi.string().valid('TENANT_SUPER_ADMIN', 'TENANT_ADMIN', 'END_USER', 'SECURITY_ADMIN', 'SECURITY_MANAGER', 'SECURITY_ANALYST', 'VIEWER').optional(),
  roles: Joi.array().items(Joi.string().valid('TENANT_SUPER_ADMIN', 'TENANT_ADMIN', 'END_USER', 'SECURITY_ADMIN', 'SECURITY_MANAGER', 'SECURITY_ANALYST', 'VIEWER')).optional(),
  projectIds: Joi.array().items(Joi.string()).optional(),
  assignedProjectIds: Joi.array().items(Joi.string()).optional()
}).unknown(true);

const updateUserStatusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'SUSPENDED', 'DISABLED', 'DEACTIVATED').insensitive().required()
}).unknown(true);

const updateProjectStatusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'ARCHIVED', 'SUSPENDED', 'DISABLED', 'INACTIVE').insensitive().required()
}).unknown(true);

const assignProjectMemberSchema = Joi.object({
  userId: Joi.string().required(),
  role: Joi.string().valid('OWNER', 'MAINTAINER', 'MEMBER', 'VIEWER').insensitive().optional(),
  permissions: Joi.array().items(Joi.string()).optional()
}).unknown(true);

const createProjectSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  key: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(2).max(50).allow('', null).optional(),
  description: Joi.string().max(500).allow('', null).optional(),
  department: Joi.string().max(100).allow('', null).optional(),
  businessUnit: Joi.string().max(100).allow('', null).optional(),
  applicationName: Joi.string().max(100).allow('', null).optional(),
  startDate: Joi.string().allow('', null).optional(),
  endDate: Joi.string().allow('', null).optional(),
  stage: Joi.string().allow('', null).optional(),
  cloudProvider: Joi.string().allow('', null).optional(),
  cloudMetadata: Joi.object().optional(),
  assignedUserIds: Joi.array().items(Joi.string()).optional(),
  initialRole: Joi.string().allow('', null).optional(),
  ownerUserId: Joi.string().allow('', null).optional(),
  settings: Joi.object().optional()
}).unknown(true);

const TenantValidator = {
  validateCreateTenant(req, res, next) {
    const { error, value } = createTenantSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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

  validateCreateUser(req, res, next) {
    const { error, value } = createUserSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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

  validateUpdateUserStatus(req, res, next) {
    const { error, value } = updateUserStatusSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    value.status = (value.status || '').toUpperCase();
    req.body = value;
    next();
  },

  validateCreateProject(req, res, next) {
    const { error, value } = createProjectSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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

  validateUpdateProjectStatus(req, res, next) {
    const { error, value } = updateProjectStatusSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    value.status = (value.status || '').toUpperCase();
    req.body = value;
    next();
  },

  validateAssignProjectMember(req, res, next) {
    const { error, value } = assignProjectMemberSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
    if (value.role) value.role = value.role.toUpperCase();
    req.body = value;
    next();
  }
};

module.exports = TenantValidator;
