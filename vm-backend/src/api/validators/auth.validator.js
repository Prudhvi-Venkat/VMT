'use strict';

const Joi = require('joi');
const PasswordPolicy = require('../../domain/policies/password-policy');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tenantRegistrationSchema = Joi.object({
  tenantKey: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(50).optional(),
  tenantName: Joi.string().min(2).max(100).optional(),
  name: Joi.string().min(2).max(100).optional(),
  displayName: Joi.string().max(150).allow('', null).optional(),
  superAdminEmail: Joi.string().email({ tlds: { allow: false } }).optional(),
  adminEmail: Joi.string().email({ tlds: { allow: false } }).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).optional(),
  superAdminPassword: Joi.string().min(8).max(128).optional(),
  adminPassword: Joi.string().min(8).max(128).optional(),
  password: Joi.string().min(8).max(128).optional(),
  superAdminName: Joi.string().max(100).allow('', null).optional(),
  adminName: Joi.string().max(100).allow('', null).optional(),
  industry: Joi.string().max(100).allow('', null).optional(),
  cloudProvider: Joi.string().max(100).allow('', null).optional(),
  environment: Joi.string().max(100).allow('', null).optional(),
  complianceFramework: Joi.string().max(100).allow('', null).optional()
}).unknown(true);

const AuthValidator = {
  validateLogin(req, res, next) {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A valid email address is required',
          requestId: req.id
        }
      });
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password is required',
          requestId: req.id
        }
      });
    }

    req.body.email = email.trim().toLowerCase();
    next();
  },

  validateRefresh(req, res, next) {
    // Check both body and cookies (cookie fallback for browser clients)
    const bodyToken = req.body?.refreshToken;
    const cookieToken = req.cookies?.refreshToken;
    const refreshToken = bodyToken || cookieToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required',
          requestId: req.id
        }
      });
    }

    req.refreshToken = refreshToken;
    next();
  },

  validateTenantRegistration(req, res, next) {
    const { error, value } = tenantRegistrationSchema.validate(req.body || {}, { abortEarly: false, allowUnknown: true });
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

    const rawTenantKey = value.tenantKey || value.tenantName;
    const tenantKey = rawTenantKey ? String(rawTenantKey).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : null;
    const name = value.name || value.tenantName;
    const superAdminEmail = (value.superAdminEmail || value.adminEmail || value.email || '').trim().toLowerCase();
    const superAdminPassword = value.superAdminPassword || value.adminPassword || value.password;

    if (!tenantKey || !name || !superAdminEmail || !superAdminPassword) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization name, tenant identifier, work email, and password are required',
          requestId: req.id
        }
      });
    }

    const complexity = PasswordPolicy.validateComplexity(superAdminPassword);
    if (!complexity.isValid) {
      return res.status(400).json({
        error: {
          code: 'PASSWORD_COMPLEXITY_ERROR',
          message: `Password does not meet complexity requirements: ${complexity.errors.join('; ')}`,
          details: complexity.errors,
          requestId: req.id
        }
      });
    }

    req.body = {
      ...value,
      tenantKey,
      name,
      displayName: value.displayName || name,
      superAdminEmail,
      superAdminPassword,
      superAdminName: value.superAdminName || value.adminName || 'Tenant Super Admin',
      industry: value.industry || 'Technology',
      cloudProvider: value.cloudProvider || value.environment || 'Multi-Cloud',
      complianceFramework: value.complianceFramework || 'SOC2'
    };
    next();
  }
};

module.exports = AuthValidator;
