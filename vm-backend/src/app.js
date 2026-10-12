'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const correlationMiddleware = require('./middleware/correlation.middleware');
const errorHandlerMiddleware = require('./middleware/error-handler.middleware');
const createAuthenticateMiddleware = require('./middleware/authenticate.middleware');
const createAuthorizeMiddleware = require('./middleware/authorize.middleware');
const createRateLimiter = require('./middleware/rate-limiter.middleware');

const createAuthRoutes = require('./api/routes/auth.routes');
const createVulnerabilityScannerRoutes = require('./api/routes/vulnerability-scanner.routes');
const createVulnerabilityIntelligenceRoutes = require('./api/routes/vulnerability-intelligence.routes');
const createPlatformTenantRoutes = require('./api/routes/platform-tenant.routes');
const createTenantAdminRoutes = require('./api/routes/tenant-admin.routes');
const createIntegrationRoutes = require('./api/routes/integration.routes');
const createDashboardRoutes = require('./api/routes/dashboard.routes');
const createAssetRoutes = require('./api/routes/asset.routes');
const createDocsRoutes = require('./api/routes/docs.routes');
const FindingValidator = require('./api/validators/finding.validator');

const { createContainer } = require('./container');

// Lightweight cookie parsing middleware
function simpleCookieParser(req, res, next) {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(c => {
      const parts = c.split('=');
      const key = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (key) {
        req.cookies[key] = decodeURIComponent(val);
      }
    });
  }

  // Response cookie helper
  res.cookie = function(name, val, options = {}) {
    let cookieStr = `${name}=${encodeURIComponent(val)}`;
    if (options.maxAge) cookieStr += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
    if (options.path) cookieStr += `; Path=${options.path}`;
    if (options.httpOnly) cookieStr += '; HttpOnly';
    if (options.secure) cookieStr += '; Secure';
    if (options.sameSite) cookieStr += `; SameSite=${options.sameSite}`;

    const existing = res.getHeader('Set-Cookie');
    if (existing) {
      const arr = Array.isArray(existing) ? existing : [existing];
      arr.push(cookieStr);
      res.setHeader('Set-Cookie', arr);
    } else {
      res.setHeader('Set-Cookie', cookieStr);
    }
  };

  res.clearCookie = function(name, options = {}) {
    res.cookie(name, '', { ...options, maxAge: 0 });
  };

  next();
}

function createApp(options = {}) {
  const app = express();
  const container = createContainer(options);

  // Basic edge & security middleware (SEC-014)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' }
  }));
  const rawCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const corsOrigins = rawCorsOrigin.includes(',')
    ? rawCorsOrigin.split(',').map(s => s.trim()).filter(Boolean)
    : rawCorsOrigin;
  app.use(cors({
    origin: corsOrigins,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(simpleCookieParser);
  app.use(correlationMiddleware);

  // Global API rate limiter (SEC-017)
  const globalRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: process.env.NODE_ENV === 'test' ? 10000 : 1000,
    message: 'Global rate limit exceeded'
  });
  app.use('/api', globalRateLimiter);

  // Auth middlewares
  const authenticateMiddleware = createAuthenticateMiddleware({
    sessionRepository: container.sessionRepository,
    userRepository: container.userRepository,
    auditService: container.auditService,
    tenantRepository: container.tenantRepository
  });
  const authorizeMiddleware = createAuthorizeMiddleware(container.auditService);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      services: {
        cache: container.cacheService.isHealthy(),
        events: 'UP'
      }
    });
  });

  // Swagger Documentation (SEC-014: disabled in production unless ENABLE_API_DOCS=true)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    app.use('/api/docs', createDocsRoutes());
  } else {
    app.use('/api/docs', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API documentation is disabled in production' } }));
  }

  // Mount API v1 Authentication routes
  const authRoutes = createAuthRoutes({
    authController: container.authController,
    authenticateMiddleware,
    authorizeMiddleware,
    getTenantManagementService: () => container.tenantManagementService
  });
  app.use('/api/v1/auth', authRoutes);

  // Mount API v1 Vulnerability Scanner routes
  const scannerRoutes = createVulnerabilityScannerRoutes({
    scannerController: container.scannerController,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/scans', scannerRoutes);

  // Mount API v1 Vulnerability Intelligence Subsystem
  const vulnerabilityRoutes = createVulnerabilityIntelligenceRoutes({
    vulnerabilityIntelligenceController: container.vulnerabilityIntelligenceController,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/vulnerabilities', vulnerabilityRoutes);

  // Mount API v1 Asset Subsystem
  const assetRoutes = createAssetRoutes({
    assetController: container.assetController,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/assets', assetRoutes);

  // Mount Role-based Dashboards Subsystem
  const dashboardRoutes = createDashboardRoutes({
    dashboardController: container.dashboardController,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1', dashboardRoutes);

  // Mount API v1 Platform Administration routes
  const platformRoutes = createPlatformTenantRoutes({
    tenantManagementService: container.tenantManagementService,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/platform', platformRoutes);

  // Mount API v1 Tenant Administration routes
  const tenantAdminRoutes = createTenantAdminRoutes({
    tenantManagementService: container.tenantManagementService,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/tenant', tenantAdminRoutes);

  // Mount API v1 Integration routes
  const integrationRoutes = createIntegrationRoutes({
    scmIntegrationService: container.scmIntegrationService,
    authenticateMiddleware,
    authorizeMiddleware
  });
  app.use('/api/v1/integrations', integrationRoutes);

  // Single finding detail endpoint (tenant scoped + global intelligence)
  app.get('/api/v1/findings/:findingId', authenticateMiddleware, authorizeMiddleware.requirePermission('findings:read'), (req, res, next) => {
    container.vulnerabilityIntelligenceController.getFindingDetail(req, res, next);
  });

  // Direct finding status update route
  app.patch('/api/v1/findings/:findingId/status', authenticateMiddleware, authorizeMiddleware.requirePermission('findings:update'), FindingValidator.validateUpdateStatus, (req, res, next) => {
    container.scannerController.updateFindingStatus(req, res, next);
  });

  // Direct finding assignment route (supports both PATCH and POST)
  const assignHandler = (req, res, next) => {
    container.scannerController.assignFinding(req, res, next);
  };
  app.patch('/api/v1/findings/:findingId/assign', authenticateMiddleware, authorizeMiddleware.requirePermission('findings:assign'), FindingValidator.validateAssignFinding, assignHandler);
  app.post('/api/v1/findings/:findingId/assign', authenticateMiddleware, authorizeMiddleware.requirePermission('findings:assign'), FindingValidator.validateAssignFinding, assignHandler);

  // Direct tenant-wide findings listing route
  app.get('/api/v1/findings', authenticateMiddleware, authorizeMiddleware.requirePermission('findings:read'), (req, res, next) => {
    container.scannerController.listTenantFindings(req, res, next);
  });

  // 404 handler for unknown endpoints
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
        requestId: req.id
      }
    });
  });

  // Central error handler
  app.use(errorHandlerMiddleware);

  return {
    app,
    authService: container.authService,
    auditService: container.auditService,
    userRepository: container.userRepository,
    sessionRepository: container.sessionRepository,
    auditRepository: container.auditRepository,
    scannerService: container.scannerService,
    scannerWorker: container.scannerWorker,
    scanQueue: container.scanQueue,
    scanRepository: container.scanRepository,
    scanComponentRepository: container.scanComponentRepository,
    scanFindingRepository: container.scanFindingRepository,
    projectRepository: container.projectRepository,
    tenantRepository: container.tenantRepository,
    vulnerabilityIntelligenceRepository: container.vulnerabilityIntelligenceRepository,
    vulnerabilityIntelligenceService: container.vulnerabilityIntelligenceService,
    dashboardService: container.dashboardService,
    sbomExportService: container.sbomExportService,
    notificationQueue: container.notificationQueue,
    tenantManagementService: container.tenantManagementService,
    riskEngineService: container.riskEngineService,
    assetService: container.assetService,
    eventBus: container.eventBus,
    cacheService: container.cacheService
  };
}

module.exports = createApp;
