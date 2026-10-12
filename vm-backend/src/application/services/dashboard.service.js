'use strict';

const logger = require('../../observability/logger');
const { FindingLifecyclePolicy, SLA_DAYS_BY_SEVERITY } = require('../../domain/policies/finding-lifecycle-policy');

class DashboardService {
  constructor({
    tenantDbManager,
    tenantRepository,
    projectRepository,
    scanRepository,
    scanFindingRepository
  }) {
    this.tenantDbManager = tenantDbManager;
    this.tenantRepository = tenantRepository;
    this.projectRepository = projectRepository;
    this.scanRepository = scanRepository;
    this.scanFindingRepository = scanFindingRepository;
  }

  _parseRangeDays(range = '30d') {
    const match = String(range).match(/^(\d+)d$/);
    const days = match ? parseInt(match[1], 10) : 30;
    return Math.min(Math.max(days, 1), 365);
  }

  _getStartDate(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  // ==========================================
  // PLATFORM ADMIN DASHBOARD
  // ==========================================
  async getPlatformDashboard() {
    let tenants = [];
    if (this.tenantRepository && this.tenantRepository.listAll) {
      try {
        const res = await this.tenantRepository.listAll({ limit: 1000 });
        tenants = res.items || [];
      } catch (err) {
        tenants = [];
      }
    }

    const tenantStats = {
      total: tenants.length,
      active: tenants.filter(t => t.status === 'ACTIVE').length,
      suspended: tenants.filter(t => t.status === 'SUSPENDED').length,
      disabled: tenants.filter(t => t.status === 'DISABLED' || t.status === 'DELETED').length,
      pending: tenants.filter(t => t.status === 'PENDING').length
    };

    let totalPlatformScans = 0;
    let totalFindingsAcrossTenants = 0;
    let totalUsersAcrossTenants = 0;

    // Aggregate telemetry across tenants if DB is accessible
    if (this.tenantDbManager && this.tenantDbManager.client) {
      try {
        for (const t of tenants.slice(0, 50)) {
          const tenantDb = this.tenantDbManager.getTenantDb(t.tenantKey);
          const [scans, findings, users] = await Promise.all([
            tenantDb.collection('scans').countDocuments().catch(() => 0),
            tenantDb.collection('scanFindings').countDocuments().catch(() => 
              tenantDb.collection('findings').countDocuments().catch(() => 0)
            ),
            tenantDb.collection('users').countDocuments().catch(() => 0)
          ]);
          totalPlatformScans += scans;
          totalFindingsAcrossTenants += findings;
          totalUsersAcrossTenants += users;
        }
      } catch (err) {
        logger.warn('Error aggregating tenant stats for platform dashboard', { error: err.message });
      }
    }

    let lastDataProcessedAt = new Date().toISOString();
    let dataPipelineStatus = 'IDLE';
    let lastPipelineRun = null;

    if (this.tenantDbManager && this.tenantDbManager.client) {
      try {
        const platformDb = this.tenantDbManager.getPlatformDb();
        const runDocs = await platformDb.collection('pipeline_runs')
          .find()
          .sort({ completed_at: -1, started_at: -1 })
          .limit(1)
          .toArray()
          .catch(() => []);
        if (runDocs && runDocs.length > 0) {
          lastPipelineRun = runDocs[0];
          lastDataProcessedAt = runDocs[0].completed_at || runDocs[0].started_at || lastDataProcessedAt;
          dataPipelineStatus = runDocs[0].status || 'COMPLETED';
        } else {
          // Check global intelligence last modified if pipeline_runs hasn't persisted yet
          const cveDocs = await this.tenantDbManager.getIntelligenceDb()
            .collection('cve_database')
            .find()
            .sort({ lastModified: -1 })
            .limit(1)
            .toArray()
            .catch(() => []);
          if (cveDocs && cveDocs.length > 0 && cveDocs[0].lastModified) {
            lastDataProcessedAt = new Date(cveDocs[0].lastModified).toISOString();
            dataPipelineStatus = 'COMPLETED';
          }
        }
      } catch (err) {
        // Fallback to recent date
      }
    }

    return {
      tenants: tenantStats,
      aggregates: {
        totalScans: totalPlatformScans,
        totalFindings: totalFindingsAcrossTenants,
        totalUsers: totalUsersAcrossTenants
      },
      telemetry: {
        lastDataProcessedAt,
        dataPipelineStatus,
        lastPipelineRun: lastPipelineRun ? {
          runId: lastPipelineRun.run_id,
          status: lastPipelineRun.status,
          startedAt: lastPipelineRun.started_at,
          completedAt: lastPipelineRun.completed_at,
          stagesCount: Array.isArray(lastPipelineRun.stages) ? lastPipelineRun.stages.length : 7
        } : null
      },
      system: {
        status: 'HEALTHY',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      },
      recentTenants: tenants.slice(0, 5).map(t => ({
        tenantKey: t.tenantKey,
        name: t.name,
        status: t.status,
        createdAt: t.createdAt
      }))
    };
  }

  // ==========================================
  // TENANT SUPER ADMIN DASHBOARD
  // ==========================================
  async getTenantDashboard(tenantId, { range = '30d' } = {}) {
    if (!tenantId) throw new Error('tenantId is required');

    const days = this._parseRangeDays(range);
    const startDate = this._getStartDate(days);

    let projects = [];
    if (this.projectRepository && this.projectRepository.findByTenant) {
      const projRes = await this.projectRepository.findByTenant(tenantId, { limit: 100 });
      projects = Array.isArray(projRes) ? projRes : (projRes?.items || []);
    }

    let scans = [];
    if (this.scanRepository && this.scanRepository.findByTenant) {
      const scansRes = await this.scanRepository.findByTenant(tenantId, { limit: 500 });
      scans = scansRes.items || [];
    }

    let findings = [];
    if (this.scanFindingRepository && this.scanFindingRepository.findByTenant) {
      const findingsRes = await this.scanFindingRepository.findByTenant(tenantId, { limit: 1000 });
      findings = findingsRes.items || [];
    }

    // Filter scans by range
    const scansInRange = scans.filter(s => new Date(s.createdAt) >= startDate);
    const completedScans = scansInRange.filter(s => s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_WARNINGS');
    const failedScans = scansInRange.filter(s => s.status === 'FAILED');

    // Calculate average scan duration
    let totalDurationMs = 0;
    let timedScansCount = 0;
    for (const s of completedScans) {
      if (s.startedAt && s.completedAt) {
        totalDurationMs += (new Date(s.completedAt) - new Date(s.startedAt));
        timedScansCount++;
      }
    }
    const avgDurationMs = timedScansCount > 0 ? Math.round(totalDurationMs / timedScansCount) : 0;

    // Severity Breakdown
    const severityCounts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNKNOWN: 0
    };

    // Status Breakdown
    const statusCounts = {
      OPEN: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      FALSE_POSITIVE: 0,
      RISK_ACCEPTED: 0
    };

    let breachedSla = 0;
    let withinSla = 0;
    const now = Date.now();
    const MS_PER_DAY = 86400000;

    for (const f of findings) {
      const sev = (f.vulnerabilitySnapshot?.severity || 'UNKNOWN').toUpperCase();
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;

      const st = (f.status || 'OPEN').toUpperCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      // SLA check for unresolved findings per FindingLifecyclePolicy
      if (st !== 'RESOLVED' && st !== 'FALSE_POSITIVE' && st !== 'CLOSED' && st !== 'ACCEPTED_RISK') {
        const slaDays = SLA_DAYS_BY_SEVERITY[sev] || SLA_DAYS_BY_SEVERITY.UNKNOWN || 90;
        const slaMs = slaDays * MS_PER_DAY;
        const ageMs = now - new Date(f.createdAt || now).getTime();
        if (ageMs > slaMs) {
          breachedSla++;
        } else {
          withinSla++;
        }
      }
    }

    // Risk Posture Score (0 - 100, where 100 is cleanest/safest)
    const activeCritical = findings.filter(f => f.status === 'OPEN' && f.vulnerabilitySnapshot?.severity === 'CRITICAL').length;
    const activeHigh = findings.filter(f => f.status === 'OPEN' && f.vulnerabilitySnapshot?.severity === 'HIGH').length;
    const activeMedium = findings.filter(f => f.status === 'OPEN' && f.vulnerabilitySnapshot?.severity === 'MEDIUM').length;

    const penalty = (activeCritical * 15) + (activeHigh * 7) + (activeMedium * 2);
    const riskPostureScore = Math.max(0, 100 - penalty);

    // Timeline Trends (bucketed daily)
    const timelineMap = new Map();
    for (let i = 0; i <= days; i++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + i);
      const key = dt.toISOString().slice(0, 10);
      timelineMap.set(key, { date: key, detected: 0, resolved: 0 });
    }

    for (const f of findings) {
      const createKey = new Date(f.createdAt).toISOString().slice(0, 10);
      if (timelineMap.has(createKey)) {
        timelineMap.get(createKey).detected++;
      }
      if (f.status === 'RESOLVED' && f.updatedAt) {
        const updateKey = new Date(f.updatedAt).toISOString().slice(0, 10);
        if (timelineMap.has(updateKey)) {
          timelineMap.get(updateKey).resolved++;
        }
      }
    }

    // Top Vulnerable Projects
    const projectExposure = projects.map(p => {
      const projFindings = findings.filter(f => f.projectId === p.id && f.status !== 'RESOLVED' && f.status !== 'FALSE_POSITIVE');
      const crit = projFindings.filter(f => f.vulnerabilitySnapshot?.severity === 'CRITICAL').length;
      const high = projFindings.filter(f => f.vulnerabilitySnapshot?.severity === 'HIGH').length;
      return {
        id: p.id,
        name: p.name,
        key: p.key,
        critical: crit,
        high: high,
        total: projFindings.length
      };
    }).sort((a, b) => (b.critical * 2 + b.high) - (a.critical * 2 + a.high)).slice(0, 5);

    return {
      range,
      days,
      overview: {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'ACTIVE').length,
        totalScans: scansInRange.length,
        completedScans: completedScans.length,
        failedScans: failedScans.length,
        avgDurationMs,
        riskPostureScore
      },
      findings: {
        total: findings.length,
        active: findings.filter(f => f.status !== 'RESOLVED' && f.status !== 'FALSE_POSITIVE').length,
        severity: severityCounts,
        status: statusCounts,
        sla: {
          withinSla,
          breachedSla,
          complianceRate: (withinSla + breachedSla) > 0 
            ? Math.round((withinSla / (withinSla + breachedSla)) * 100) 
            : 100
        }
      },
      timeline: Array.from(timelineMap.values()),
      topProjects: projectExposure
    };
  }

  // ==========================================
  // PROJECT DASHBOARD
  // ==========================================
  async getProjectDashboard(tenantId, projectId, principal = null) {
    if (!tenantId || !projectId) throw new Error('tenantId and projectId required');

    let project = null;
    if (this.projectRepository && this.projectRepository.findById) {
      project = await this.projectRepository.findById(tenantId, projectId);
    }
    if (!project) {
      return null;
    }

    if (principal) {
      const isPrivileged = principal.roles && principal.roles.some(r => ['PLATFORM_ADMIN', 'TENANT_SUPER_ADMIN', 'TENANT_ADMIN', 'SECURITY_MANAGER'].includes(r));
      if (!isPrivileged) {
        const isOwner = project.ownerUserId === principal.userId;
        const isMember = project.members && project.members.some(m => m.userId === principal.userId);
        if (!isOwner && !isMember) {
          const err = new Error('Access denied: not a member of this project');
          err.code = 'FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
    }

    let findings = [];
    if (this.scanFindingRepository && this.scanFindingRepository.findByTenant) {
      const res = await this.scanFindingRepository.findByTenant(tenantId, { projectId, limit: 500 });
      findings = res.items || [];
    }

    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    const statusCounts = { OPEN: 0, IN_REVIEW: 0, RESOLVED: 0, FALSE_POSITIVE: 0 };

    for (const f of findings) {
      const sev = (f.vulnerabilitySnapshot?.severity || 'UNKNOWN').toUpperCase();
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
      const st = (f.status || 'OPEN').toUpperCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    }

    let scans = [];
    if (this.scanRepository && this.scanRepository.findByTenant) {
      const scansRes = await this.scanRepository.findByTenant(tenantId, { projectId, limit: 10 });
      scans = scansRes.items || [];
    }

    // Top critical vulnerabilities
    const topVulnerabilities = findings
      .filter(f => f.status !== 'RESOLVED' && f.status !== 'FALSE_POSITIVE')
      .sort((a, b) => (b.vulnerabilitySnapshot?.cvssScore || 0) - (a.vulnerabilitySnapshot?.cvssScore || 0))
      .slice(0, 5)
      .map(f => ({
        findingId: f.id,
        vulnerabilityId: f.cveId || f.vulnerabilityId,
        packageName: f.componentSnapshot?.name,
        installedVersion: f.componentSnapshot?.version,
        severity: f.vulnerabilitySnapshot?.severity,
        cvssScore: f.vulnerabilitySnapshot?.cvssScore,
        remediation: f.remediation?.recommendedVersion
      }));

    return {
      project: {
        id: project.id,
        name: project.name,
        key: project.key,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt
      },
      metrics: {
        totalFindings: findings.length,
        activeFindings: findings.filter(f => f.status !== 'RESOLVED' && f.status !== 'FALSE_POSITIVE').length,
        severity: severityCounts,
        status: statusCounts
      },
      recentScans: scans.slice(0, 5).map(s => ({
        id: s.id,
        status: s.status,
        componentCount: s.componentCount,
        findingCount: s.findingCount,
        createdAt: s.createdAt
      })),
      topVulnerabilities
    };
  }

  // ==========================================
  // END USER DASHBOARD
  // ==========================================
  async getMeDashboard(tenantId, userId) {
    if (!tenantId || !userId) throw new Error('tenantId and userId required');

    let allProjects = [];
    if (this.projectRepository && this.projectRepository.findByTenant) {
      const projRes = await this.projectRepository.findByTenant(tenantId, { limit: 100 });
      allProjects = Array.isArray(projRes) ? projRes : (projRes?.items || []);
    }

    // Filter projects where user is owner or member
    const userProjects = allProjects.filter(p => 
      p.ownerUserId === userId || 
      (p.members && p.members.some(m => m.userId === userId))
    );

    const userProjectIds = userProjects.map(p => p.id);

    let scans = [];
    if (this.scanRepository && this.scanRepository.findByTenant) {
      const scansRes = await this.scanRepository.findByTenant(tenantId, { limit: 100 });
      scans = (scansRes.items || []).filter(s => (s.userId === userId || s.createdBy === userId) || (s.projectId && userProjectIds.includes(s.projectId)));
    }

    let findings = [];
    if (this.scanFindingRepository && this.scanFindingRepository.findByTenant) {
      const findingsRes = await this.scanFindingRepository.findByTenant(tenantId, { limit: 500 });
      findings = (findingsRes.items || []).filter(f => 
        (f.projectId && userProjectIds.includes(f.projectId)) ||
        f.assignedTo === userId
      );
    }

    const urgentFindings = findings
      .filter(f => f.status === 'OPEN' && (f.vulnerabilitySnapshot?.severity === 'CRITICAL' || f.vulnerabilitySnapshot?.severity === 'HIGH'))
      .sort((a, b) => (b.vulnerabilitySnapshot?.cvssScore || 0) - (a.vulnerabilitySnapshot?.cvssScore || 0))
      .slice(0, 10)
      .map(f => ({
        id: f.id,
        cveId: f.cveId || f.vulnerabilityId,
        packageName: f.componentSnapshot?.name,
        severity: f.vulnerabilitySnapshot?.severity,
        cvssScore: f.vulnerabilitySnapshot?.cvssScore,
        createdAt: f.createdAt
      }));

    return {
      summary: {
        accessibleProjectsCount: userProjects.length,
        recentScansCount: scans.length,
        assignedFindingsCount: findings.length,
        urgentActionRequired: urgentFindings.length
      },
      accessibleProjects: userProjects.map(p => ({ id: p.id, name: p.name, key: p.key })),
      recentScans: scans.slice(0, 5).map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        findingCount: s.findingCount,
        createdAt: s.createdAt
      })),
      urgentFindings
    };
  }
}

module.exports = DashboardService;
