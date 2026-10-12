'use strict';

const config = require('../../config');
const AuthSerializer = require('../serializers/auth.serializer');

class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  _setRefreshCookie(res, refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: config.security.cookieSameSite,
      maxAge: config.session.refreshTokenTtlSeconds * 1000,
      path: '/' // Match both Next.js proxy (/backend-api/*) and direct backend fallback (${DIRECT}/api/v1/*)
    });
  }

  _clearRefreshCookie(res) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: config.security.cookieSameSite,
      path: '/'
    });
  }

  async login(req, res, next) {
    try {
      const { email, password, tenantKey } = req.body || {};
      const resolvedTenantKey = tenantKey || req.headers['x-tenant-id'] || null;
      const ip = req.ip || req.connection?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const correlationId = req.correlationId;

      const result = await this.authService.login({
        email,
        password,
        tenantKey: resolvedTenantKey,
        ip,
        userAgent,
        correlationId
      });

      this._setRefreshCookie(res, result.refreshToken);

      res.status(200).json(AuthSerializer.serializeAuthResponse(result));
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.refreshToken || req.body?.refreshToken;
      const ip = req.ip || req.connection?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const correlationId = req.correlationId;

      const result = await this.authService.refresh({
        refreshToken,
        ip,
        userAgent,
        correlationId
      });

      this._setRefreshCookie(res, result.refreshToken);

      res.status(200).json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        expiresIn: result.expiresIn
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const sessionId = req.principal?.sessionId;
      const userId = req.principal?.userId;
      const ip = req.ip || req.connection?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const correlationId = req.correlationId;

      await this.authService.logout({
        sessionId,
        userId,
        ip,
        userAgent,
        correlationId
      });

      this._clearRefreshCookie(res);

      res.status(200).json({
        message: 'Logged out successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req, res, next) {
    try {
      const userId = req.principal?.userId;
      const ip = req.ip || req.connection?.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const correlationId = req.correlationId;

      await this.authService.logoutAll({
        userId,
        ip,
        userAgent,
        correlationId
      });

      this._clearRefreshCookie(res);

      res.status(200).json({
        message: 'All sessions logged out successfully'
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req, res, next) {
    try {
      const principal = req.principal;
      const correlationId = req.correlationId;

      const profile = await this.authService.getMe({
        principal,
        correlationId
      });

      res.status(200).json(AuthSerializer.serializeUser(profile));
    } catch (err) {
      next(err);
    }
  }

  async getPreferences(req, res, next) {
    try {
      const preferences = await this.authService.getPreferences({
        principal: req.principal,
        correlationId: req.correlationId
      });

      res.status(200).json({ success: true, data: preferences });
    } catch (err) {
      next(err);
    }
  }

  async updatePreferences(req, res, next) {
    try {
      const preferences = await this.authService.updatePreferences({
        userId: req.principal?.userId,
        preferences: req.body?.preferences ?? req.body,
        correlationId: req.correlationId
      });

      res.status(200).json({ success: true, data: preferences, message: 'Preferences saved successfully' });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res, next) {
    try {
      const userId = req.principal?.userId;
      const tenantKey = req.principal?.tenantId;
      const { currentPassword, newPassword } = req.body;
      const correlationId = req.correlationId;

      const result = await this.authService.changePassword({
        userId,
        tenantKey,
        currentPassword,
        newPassword,
        correlationId
      });

      this._clearRefreshCookie(res);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email, tenantKey } = req.body;
      const correlationId = req.correlationId;

      const result = await this.authService.forgotPassword({
        email,
        tenantKey,
        correlationId
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { token, newPassword, tenantKey } = req.body;
      const correlationId = req.correlationId;

      const result = await this.authService.resetPassword({
        token,
        newPassword,
        tenantKey,
        correlationId
      });

      this._clearRefreshCookie(res);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
