'use strict';

const crypto = require('crypto');
const { Tenant, TenantStatus } = require('../../domain/entities/tenant.entity');
const { User, UserStatus } = require('../../domain/entities/user.entity');
const { Project, ProjectMember, ProjectStatus } = require('../../domain/entities/project.entity');
const PasswordPolicy = require('../../domain/policies/password-policy');
const logger = require('../../observability/logger');

class TenantManagementService {
  constructor({ tenantDbManager, tenantRepository, projectRepository, userRepository }) {
    this.tenantDbManager = tenantDbManager;
    this.tenantRepository = tenantRepository;
    this.projectRepository = projectRepository;
    this.userRepository = userRepository;
    this.inMemoryTenants = new Map();
    this.inMemoryUsers = new Map();
    this.inMemoryProjects = new Map();
    this.inMemoryAssets = new Map();
    this.inMemoryPlatformAdmins = new Map();
  }

  // ==========================================
  // PLATFORM ADMIN OPERATIONS
  // ==========================================

  async createTenant({
    tenantKey,
    name,
    displayName,
    superAdminEmail,
    superAdminPassword,
    superAdminName = 'Tenant Super Admin',
    createdBy = 'usr_platform_admin'
  }) {
    if (!tenantKey || !name) {
      const err = new Error('tenantKey and name are required');
      err.statusCode = 400;
      throw err;
    }
    if (!superAdminEmail || !superAdminPassword) {
      const err = new Error('superAdminEmail and superAdminPassword are required');
      err.statusCode = 400;
      throw err;
    }

    const cleanKey = this.tenantDbManager?.sanitizeTenantKey
      ? this.tenantDbManager.sanitizeTenantKey(tenantKey)
      : tenantKey.toLowerCase();

    if (this.inMemoryTenants.has(cleanKey)) {
      const err = new Error(`Tenant with key "${cleanKey}" already exists`);
      err.statusCode = 409;
      throw err;
    }

    if (this.tenantRepository?.findByKey) {
      try {
        const existing = await this.tenantRepository.findByKey(cleanKey);
        if (existing) {
          const err = new Error(`Tenant with key "${cleanKey}" already exists`);
          err.statusCode = 409;
          throw err;
        }
      } catch (e) {}
    }

    // 1. Provision isolated tenant database and indexes if MongoDB is connected
    let tenantDb = null;
    if (this.tenantDbManager?.client) {
      tenantDb = await this.tenantDbManager.provisionTenantDatabase(cleanKey);
    }

    // 2. Persist Tenant
    const tenant = new Tenant({
      tenantKey: cleanKey,
      name,
      displayName: displayName || name,
      status: TenantStatus.ACTIVE,
      databaseName: tenantDb ? tenantDb.databaseName : `vm_tenant_${cleanKey}`,
      createdBy
    });
    if (this.tenantRepository?.save) {
      try {
        await this.tenantRepository.save(tenant);
      } catch (e) {}
    }
    this.inMemoryTenants.set(cleanKey, tenant);

    // 3. Create Tenant Super Admin
    const adminEmail = superAdminEmail.toLowerCase().trim();
    const adminPassword = superAdminPassword;
    const adminComplexity = PasswordPolicy.validateComplexity(adminPassword);
    if (!adminComplexity.isValid) {
      const err = new Error(`Password does not meet complexity requirements: ${adminComplexity.errors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    const superAdmin = new User({
      id: `usr_${cleanKey}_superadmin_01`,
      email: adminEmail,
      passwordHash: PasswordPolicy.hash(adminPassword),
      status: UserStatus.ACTIVE,
      roles: ['TENANT_SUPER_ADMIN'],
      scope: 'tenant',
      tenantId: cleanKey,
      mustChangePassword: false,
      securityMetadata: { name: superAdminName }
    });

    if (tenantDb) {
      await tenantDb.collection('users').updateOne(
        { email: adminEmail },
        { $set: superAdmin },
        { upsert: true }
      );
    }
    if (this.userRepository?.save && (!tenantDb || this.userRepository.constructor.name === 'MemoryUserRepository')) {
      await this.userRepository.save(superAdmin);
    }
    this.inMemoryUsers.set(adminEmail, superAdmin);

    // 4. Create default Initial Project
    const initialProject = new Project({
      id: `proj_${cleanKey}_default`,
      name: `${name} Core Application`,
      key: cleanKey.substring(0, 6).toUpperCase(),
      description: 'Default enterprise project for vulnerability exposure management',
      status: ProjectStatus.ACTIVE,
      ownerUserId: superAdmin.id,
      createdBy: superAdmin.id
    });
    if (this.projectRepository?.save) {
      try {
        await this.projectRepository.save(cleanKey, initialProject);
        await this.projectRepository.addMember(cleanKey, new ProjectMember({
          projectId: initialProject.id,
          userId: superAdmin.id,
          role: 'OWNER',
          permissions: ['*']
        }));
      } catch (e) {}
    }
    this.inMemoryProjects.set(initialProject.id, initialProject);

    // 5. Record Platform Audit Log if MongoDB connected
    if (this.tenantDbManager?.client) {
      const platformDb = this.tenantDbManager.getPlatformDb();
      await platformDb.collection('platform_audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'tenant.created',
        actor: { userId: createdBy },
        resource: { type: 'tenant', id: cleanKey },
        details: { name, databaseName: tenantDb ? tenantDb.databaseName : `vm_tenant_${cleanKey}`, superAdminEmail: adminEmail },
        timestamp: new Date()
      });
    }

    logger.info('Tenant provisioned successfully', {
      tenantKey: cleanKey,
      database: tenantDb ? tenantDb.databaseName : `vm_tenant_${cleanKey}`,
      superAdminEmail: adminEmail
    });

    return {
      tenant,
      superAdmin: {
        id: superAdmin.id,
        email: superAdmin.email,
        roles: superAdmin.roles,
        tenantId: superAdmin.tenantId
      },
      initialProject
    };
  }

  async listTenants(options = {}) {
    const result = await this.tenantRepository.listAll(options);
    // Enrich with tenant stats
    const enriched = await Promise.all(result.items.map(async (tenant) => {
      try {
        const tenantDb = this.tenantDbManager.getTenantDb(tenant.tenantKey);
        const [usersCount, projectsCount, scansCount, findingsCount] = await Promise.all([
          tenantDb.collection('users').countDocuments(),
          tenantDb.collection('projects').countDocuments(),
          tenantDb.collection('scans').countDocuments(),
          tenantDb.collection('scanFindings').countDocuments({ status: { $ne: 'CLOSED' } })
            .catch(() => tenantDb.collection('findings').countDocuments({ status: { $ne: 'CLOSED' } }))
        ]);
        return {
          ...tenant,
          stats: {
            users: usersCount,
            projects: projectsCount,
            scans: scansCount,
            openFindings: findingsCount
          }
        };
      } catch (e) {
        return { ...tenant, stats: { users: 0, projects: 0, scans: 0, openFindings: 0 } };
      }
    }));

    return { items: enriched, total: result.total };
  }

  async getTenant(tenantKey) {
    const tenant = await this.tenantRepository.findByKey(tenantKey);
    if (!tenant) return null;
    const tenantDb = this.tenantDbManager.getTenantDb(tenant.tenantKey);
    const [usersCount, projectsCount, scansCount, findingsCount] = await Promise.all([
      tenantDb.collection('users').countDocuments(),
      tenantDb.collection('projects').countDocuments(),
      tenantDb.collection('scans').countDocuments(),
      tenantDb.collection('scanFindings').countDocuments()
        .catch(() => tenantDb.collection('findings').countDocuments())
    ]);
    return {
      ...tenant,
      stats: {
        users: usersCount,
        projects: projectsCount,
        scans: scansCount,
        findings: findingsCount
      }
    };
  }

  async updateTenantStatus(tenantKey, status, actorUserId = 'usr_platform_admin') {
    const updated = await this.tenantRepository.updateStatus(tenantKey, status);
    const platformDb = this.tenantDbManager.getPlatformDb();
    await platformDb.collection('platform_audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: `tenant.status_${status.toLowerCase()}`,
      actor: { userId: actorUserId },
      resource: { type: 'tenant', id: tenantKey },
      details: { status },
      timestamp: new Date()
    });
    return updated;
  }

  async createTenantSuperAdmin(tenantKey, { email, password, name = 'Super Admin' }, actorUserId = 'usr_platform_admin') {
    if (!email || !password) {
      const err = new Error('email and password are required');
      err.statusCode = 400;
      throw err;
    }

    const adminComplexity = PasswordPolicy.validateComplexity(password);
    if (!adminComplexity.isValid) {
      const err = new Error(`Password does not meet complexity requirements: ${adminComplexity.errors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.toLowerCase().trim();
    const tenantDb = this.tenantDbManager?.getTenantDb ? this.tenantDbManager.getTenantDb(tenantKey) : null;
    if (tenantDb) {
      const existing = await tenantDb.collection('users').findOne({ email: cleanEmail });
      if (existing) {
        const err = new Error(`User with email "${cleanEmail}" already exists in tenant "${tenantKey}"`);
        err.statusCode = 409;
        throw err;
      }
    }

    const user = new User({
      id: `usr_${tenantKey}_admin_${Date.now()}`,
      email: cleanEmail,
      passwordHash: PasswordPolicy.hash(password),
      status: UserStatus.ACTIVE,
      roles: ['TENANT_SUPER_ADMIN'],
      scope: 'tenant',
      tenantId: tenantKey,
      mustChangePassword: true,
      securityMetadata: { name }
    });

    if (tenantDb) {
      await tenantDb.collection('users').insertOne(user);
    }
    if (this.tenantDbManager?.getPlatformDb) {
      const platformDb = this.tenantDbManager.getPlatformDb();
      await platformDb.collection('platform_audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'tenant_admin.created',
        actor: { userId: actorUserId },
        resource: { type: 'user', id: user.id },
        details: { tenantKey, email: cleanEmail },
        timestamp: new Date()
      });
    }

    return user;
  }

  // ==========================================
  // TENANT SUPER ADMIN OPERATIONS
  // ==========================================

  async createEndUser(tenantKey, {
    email,
    password,
    name = '',
    firstName = '',
    lastName = '',
    title = '',
    employeeId = '',
    department = '',
    roles = ['END_USER'],
    assignedProjectIds = []
  }, actorUserId) {
    if (!email || !password) {
      const err = new Error('email and password are required');
      err.code = 'INVALID_REQUEST';
      err.statusCode = 400;
      throw err;
    }

    const userComplexity = PasswordPolicy.validateComplexity(password);
    if (!userComplexity.isValid) {
      const err = new Error(`Password does not meet complexity requirements: ${userComplexity.errors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.toLowerCase().trim();
    const tenantDb = this.tenantDbManager?.getTenantDb ? this.tenantDbManager.getTenantDb(tenantKey) : null;
    if (tenantDb) {
      const existing = await tenantDb.collection('users').findOne({ email: cleanEmail });
      if (existing) {
        const err = new Error(`User with email "${cleanEmail}" already exists in tenant`);
        err.statusCode = 409;
        throw err;
      }
    }

    const rawRoles = Array.isArray(roles) ? roles : [roles];
    if (rawRoles.some(r => r === 'PLATFORM_ADMIN' || r === 'PLATFORM_OPERATOR')) {
      const err = new Error('Platform roles cannot be assigned to tenant-scoped users');
      err.code = 'INVALID_TENANT_ROLE';
      err.statusCode = 400;
      throw err;
    }

    const resolvedName = name || `${firstName} ${lastName}`.trim() || 'End User';
    const user = new User({
      id: `usr_${tenantKey}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: cleanEmail,
      passwordHash: PasswordPolicy.hash(password),
      status: UserStatus.ACTIVE,
      roles: rawRoles,
      scope: 'tenant',
      tenantId: tenantKey,
      firstName,
      lastName,
      title,
      employeeId,
      department,
      assignedProjectIds: Array.isArray(assignedProjectIds) ? assignedProjectIds : [],
      securityMetadata: {
        name: resolvedName,
        firstName,
        lastName,
        title,
        employeeId,
        department,
        assignedProjectIds
      }
    });

    if (tenantDb) {
      await tenantDb.collection('users').insertOne(user);
    }
    if (this.userRepository?.save && (!tenantDb || this.userRepository.constructor.name === 'MemoryUserRepository')) {
      await this.userRepository.save(user);
    }
    this.inMemoryUsers.set(user.id, user);

    // Assign to projects if provided
    if (Array.isArray(assignedProjectIds) && assignedProjectIds.length > 0 && this.projectRepository?.addMember) {
      for (const projectId of assignedProjectIds) {
        await this.projectRepository.addMember(tenantKey, new ProjectMember({
          projectId,
          userId: user.id,
          role: 'MEMBER'
        }));
      }
    }

    // Tenant audit log
    if (tenantDb) {
      await tenantDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'user.created',
        userId: actorUserId,
        resourceType: 'user',
        resourceId: user.id,
        details: { email: cleanEmail, roles: user.roles, assignedProjectIds, title, department, employeeId },
        timestamp: new Date()
      });
    }

    return user;
  }

  async listTenantUsers(tenantKey) {
    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    const docs = await tenantDb.collection('users').find().sort({ createdAt: -1 }).toArray();
    let members = [];
    try {
      members = await tenantDb.collection('project_members').find().toArray();
    } catch {}

    const userProjectsMap = {};
    for (const m of members) {
      if (!userProjectsMap[m.userId]) userProjectsMap[m.userId] = [];
      userProjectsMap[m.userId].push(m.projectId);
    }

    return docs.map(d => {
      const u = new User(d);
      delete u.passwordHash;
      if (userProjectsMap[u.id]) {
        u.assignedProjectIds = Array.from(new Set([...(u.assignedProjectIds || []), ...userProjectsMap[u.id]]));
      }
      return u;
    });
  }

  async updateTenantUserStatus(tenantKey, userId, status, actorUserId) {
    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    await tenantDb.collection('users').updateOne(
      { id: userId },
      { $set: { status, updatedAt: new Date() } }
    );
    await tenantDb.collection('audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: `user.status_${status.toLowerCase()}`,
      userId: actorUserId,
      resourceType: 'user',
      resourceId: userId,
      details: { status },
      timestamp: new Date()
    });
    return { id: userId, status };
  }

  async createProject(tenantKey, {
    name,
    key,
    description = '',
    department = '',
    businessUnit = '',
    applicationName = '',
    startDate = null,
    endDate = null,
    stage = 'DEV',
    cloudProvider = 'NONE',
    cloudMetadata = {},
    assignedUserIds = [],
    initialRole = 'MEMBER',
    ownerUserId = null
  }, actorUserId) {
    const project = new Project({
      name,
      key: key || name.substring(0, 6).toUpperCase(),
      description,
      department: department || businessUnit || '',
      businessUnit: department || businessUnit || '',
      applicationName: applicationName || name,
      startDate,
      endDate,
      stage: stage || 'DEV',
      cloudProvider: cloudProvider || 'NONE',
      cloudMetadata: cloudMetadata || {},
      ownerUserId: ownerUserId || actorUserId,
      createdBy: actorUserId
    });

    const saved = await this.projectRepository.save(tenantKey, project);

    // Add creator as OWNER member
    await this.projectRepository.addMember(tenantKey, new ProjectMember({
      projectId: saved.id,
      userId: actorUserId,
      role: 'OWNER',
      permissions: ['*']
    }));

    // Add initial assigned users if provided
    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      for (const uId of assignedUserIds) {
        if (uId !== actorUserId) {
          await this.projectRepository.addMember(tenantKey, new ProjectMember({
            projectId: saved.id,
            userId: uId,
            role: initialRole || 'MEMBER'
          }));
        }
      }
    }

    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    await tenantDb.collection('audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: 'project.created',
      userId: actorUserId,
      projectId: saved.id,
      resourceType: 'project',
      resourceId: saved.id,
      details: { name: saved.name, key: saved.key, stage: saved.stage, cloudProvider: saved.cloudProvider },
      timestamp: new Date()
    });

    return saved;
  }

  async updateProjectStatus(tenantKey, projectId, status, actorUserId) {
    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    const validStatus = status === 'DISABLED' || status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE';
    await tenantDb.collection('projects').updateOne(
      { id: projectId },
      { $set: { status: validStatus, updatedAt: new Date() } }
    );
    await tenantDb.collection('audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: `project.status_${validStatus.toLowerCase()}`,
      userId: actorUserId,
      projectId,
      resourceType: 'project',
      resourceId: projectId,
      details: { status: validStatus },
      timestamp: new Date()
    });
    return { id: projectId, status: validStatus };
  }

  async listProjects(tenantKey, userPrincipal = null) {
    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    let memberCounts = {};
    try {
      const members = await tenantDb.collection('project_members').find().toArray();
      for (const m of members) {
        memberCounts[m.projectId] = (memberCounts[m.projectId] || 0) + 1;
      }
    } catch {}

    let rawProjects = [];
    if (!userPrincipal) {
      const res = await this.projectRepository.list(tenantKey);
      rawProjects = res.items;
    } else if (userPrincipal.roles.includes('TENANT_SUPER_ADMIN') || userPrincipal.roles.includes('PLATFORM_ADMIN')) {
      const res = await this.projectRepository.list(tenantKey);
      rawProjects = res.items;
    } else {
      rawProjects = await this.projectRepository.listUserProjects(tenantKey, userPrincipal.userId);
    }

    return rawProjects.map(p => {
      const item = { ...p };
      item.membersCount = memberCounts[p.id] || (p.members?.length) || 1;
      return item;
    });
  }

  async assignProjectMember(tenantKey, projectId, { userId, permissions, role }, actorUserId) {
    const member = new ProjectMember({
      projectId,
      userId,
      permissions: permissions || ['scans:read', 'scans:create', 'findings:read', 'findings:update'],
      role: role || 'MEMBER'
    });
    const saved = await this.projectRepository.addMember(tenantKey, member);

    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    await tenantDb.collection('audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: 'project.member_added',
      userId: actorUserId,
      projectId,
      resourceType: 'user',
      resourceId: userId,
      details: { role: saved.role },
      timestamp: new Date()
    });

    return saved;
  }

  async getTenantAuditLogs(tenantKey, { userId, action, projectId, limit = 100, offset = 0 } = {}) {
    const tenantDb = this.tenantDbManager.getTenantDb(tenantKey);
    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (projectId) query.projectId = projectId;

    const cursor = tenantDb.collection('audit_logs')
      .find(query)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      tenantDb.collection('audit_logs').countDocuments(query)
    ]);

    return { items: docs, total };
  }

  async updateTenantStatus(tenantKey, newStatus, reason = '', actorUserId = 'system') {
    const cleanKey = this.tenantDbManager.sanitizeTenantKey(tenantKey);
    const tenant = await this.tenantRepository.findByKey(cleanKey);
    if (!tenant) {
      const err = new Error(`Tenant with key "${cleanKey}" not found`);
      err.statusCode = 404;
      throw err;
    }

    const oldStatus = tenant.status;
    tenant.status = newStatus;
    tenant.updatedAt = new Date();
    await this.tenantRepository.update(tenant);

    const platformDb = this.tenantDbManager.getPlatformDb();
    await platformDb.collection('platform_audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: `tenant.${newStatus.toLowerCase()}`,
      actor: { userId: actorUserId },
      resource: { type: 'tenant', id: cleanKey },
      details: { oldStatus, newStatus, reason },
      timestamp: new Date()
    });

    logger.info(`Tenant status updated`, { tenantKey: cleanKey, oldStatus, newStatus, reason });
    return tenant;
  }

  async activateTenant(tenantKey, actorUserId) {
    return this.updateTenantStatus(tenantKey, 'ACTIVE', 'Re-activated by administrator', actorUserId);
  }

  async suspendTenant(tenantKey, reason, actorUserId) {
    return this.updateTenantStatus(tenantKey, 'SUSPENDED', reason || 'Suspended by platform administrator', actorUserId);
  }

  async disableTenant(tenantKey, reason, actorUserId) {
    return this.updateTenantStatus(tenantKey, 'DISABLED', reason || 'Disabled by platform administrator', actorUserId);
  }

  async decommissionTenant(tenantKey, reason, actorUserId) {
    return this.updateTenantStatus(tenantKey, 'DELETED', reason || 'Decommissioned by platform administrator', actorUserId);
  }

  // ==========================================
  // TENANT & SUPER ADMIN MODIFICATION (Platform Admin)
  // ==========================================

  async updateTenant(tenantKey, updates = {}, actorUserId = 'usr_platform_admin') {
    const cleanKey = this.tenantDbManager.sanitizeTenantKey(tenantKey);
    const tenant = await this.tenantRepository.findByKey(cleanKey);
    if (!tenant) {
      const err = new Error(`Tenant with key "${cleanKey}" not found`);
      err.statusCode = 404;
      throw err;
    }

    if (updates.name) tenant.name = updates.name.trim();
    if (updates.displayName) tenant.displayName = updates.displayName.trim();
    if (updates.description !== undefined) tenant.description = updates.description;
    if (updates.contactEmail !== undefined) tenant.contactEmail = updates.contactEmail;
    tenant.updatedAt = new Date();
    await this.tenantRepository.update(tenant);

    const platformDb = this.tenantDbManager.getPlatformDb();
    await platformDb.collection('platform_audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: 'tenant.updated',
      actor: { userId: actorUserId },
      resource: { type: 'tenant', id: cleanKey },
      details: { updates },
      timestamp: new Date()
    });

    return tenant;
  }

  async listTenantSuperAdmins(tenantKey) {
    const cleanKey = this.tenantDbManager.sanitizeTenantKey(tenantKey);
    const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
    const admins = await tenantDb.collection('users').find({
      roles: 'TENANT_SUPER_ADMIN'
    }).toArray();
    return admins.map(u => {
      const copy = { ...u };
      delete copy.passwordHash;
      return copy;
    });
  }

  async updateTenantSuperAdmin(tenantKey, userId, updates = {}, actorUserId = 'usr_platform_admin') {
    const cleanKey = this.tenantDbManager.sanitizeTenantKey(tenantKey);
    const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
    const user = await tenantDb.collection('users').findOne({ id: userId });
    if (!user) {
      const err = new Error(`Super admin with ID "${userId}" not found in tenant "${cleanKey}"`);
      err.statusCode = 404;
      throw err;
    }

    const setFields = { updatedAt: new Date() };
    if (updates.email) setFields.email = updates.email.toLowerCase().trim();
    if (updates.status) setFields.status = updates.status;
    if (updates.name || updates.firstName || updates.lastName || updates.title || updates.department) {
      setFields.securityMetadata = {
        ...(user.securityMetadata || {}),
        name: updates.name || user.securityMetadata?.name,
        firstName: updates.firstName || user.securityMetadata?.firstName,
        lastName: updates.lastName || user.securityMetadata?.lastName,
        title: updates.title || user.securityMetadata?.title,
        department: updates.department || user.securityMetadata?.department
      };
    }

    await tenantDb.collection('users').updateOne({ id: userId }, { $set: setFields });

    const platformDb = this.tenantDbManager.getPlatformDb();
    await platformDb.collection('platform_audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: 'tenant.super_admin_updated',
      actor: { userId: actorUserId },
      resource: { type: 'user', id: userId, tenantId: cleanKey },
      details: { updates },
      timestamp: new Date()
    });

    const updated = await tenantDb.collection('users').findOne({ id: userId });
    if (updated) delete updated.passwordHash;
    return updated;
  }

  async resetTenantSuperAdminPassword(tenantKey, userId, newPassword, actorUserId = 'usr_platform_admin') {
    if (!newPassword || newPassword.length < 8) {
      const err = new Error('newPassword must be at least 8 characters long');
      err.statusCode = 400;
      throw err;
    }
    const cleanKey = this.tenantDbManager.sanitizeTenantKey(tenantKey);
    const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
    const user = await tenantDb.collection('users').findOne({ id: userId });
    if (!user) {
      const err = new Error(`User "${userId}" not found in tenant "${cleanKey}"`);
      err.statusCode = 404;
      throw err;
    }

    const passwordHash = PasswordPolicy.hash(newPassword);
    await tenantDb.collection('users').updateOne(
      { id: userId },
      { $set: { passwordHash, mustChangePassword: true, updatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }
    );

    const platformDb = this.tenantDbManager.getPlatformDb();
    await platformDb.collection('platform_audit_logs').insertOne({
      id: crypto.randomUUID(),
      action: 'tenant.super_admin_password_reset',
      actor: { userId: actorUserId },
      resource: { type: 'user', id: userId, tenantId: cleanKey },
      details: { resetBy: actorUserId },
      timestamp: new Date()
    });

    return { success: true, message: 'Password reset successfully', userId };
  }

  // ==========================================
  // PLATFORM ADMIN REGISTRATION (Only Platform Admin)
  // ==========================================

  async registerPlatformAdmin({ name, email, password, roles = ['PLATFORM_ADMIN'] }, actorUserId = 'usr_platform_admin') {
    if (!email || !password) {
      const err = new Error('email and password are required');
      err.statusCode = 400;
      throw err;
    }

    const adminComplexity = PasswordPolicy.validateComplexity(password);
    if (!adminComplexity.isValid) {
      const err = new Error(`Password does not meet complexity requirements: ${adminComplexity.errors.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.toLowerCase().trim();

    let existing = null;
    if (this.tenantDbManager?.client) {
      const platformDb = this.tenantDbManager.getPlatformDb();
      existing = await platformDb.collection('users').findOne({ email: cleanEmail });
    } else if (this.userRepository?.findByEmail) {
      existing = await this.userRepository.findByEmail(cleanEmail);
    }
    if (existing || this.inMemoryPlatformAdmins.has(cleanEmail)) {
      const err = new Error(`User with email "${cleanEmail}" already exists`);
      err.statusCode = 409;
      throw err;
    }

    const newAdmin = new User({
      id: `usr_platform_admin_${Date.now()}`,
      email: cleanEmail,
      passwordHash: PasswordPolicy.hash(password),
      status: UserStatus.ACTIVE,
      roles: ['PLATFORM_ADMIN'],
      scope: 'platform',
      tenantId: null,
      mustChangePassword: false,
      securityMetadata: { name: name || 'Platform Administrator' }
    });

    if (this.tenantDbManager?.client) {
      const platformDb = this.tenantDbManager.getPlatformDb();
      await platformDb.collection('users').insertOne(newAdmin);
      await platformDb.collection('platform_audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'platform.admin_registered',
        actor: { userId: actorUserId },
        resource: { type: 'user', id: newAdmin.id },
        details: { email: cleanEmail, roles: newAdmin.roles },
        timestamp: new Date()
      });
    }

    if (this.userRepository?.save) {
      await this.userRepository.save(newAdmin);
    }
    this.inMemoryPlatformAdmins.set(cleanEmail, newAdmin);

    const sanitized = { ...newAdmin };
    delete sanitized.passwordHash;
    return sanitized;
  }

  async createPlatformAdmin(payload, actorUserId) {
    return this.registerPlatformAdmin(payload, actorUserId);
  }

  async listPlatformAdmins() {
    if (this.tenantDbManager?.client) {
      const platformDb = this.tenantDbManager.getPlatformDb();
      const docs = await platformDb.collection('users').find({
        roles: 'PLATFORM_ADMIN'
      }).toArray();
      return docs.map(d => {
        const copy = { ...d };
        delete copy.passwordHash;
        return copy;
      });
    }

    const list = Array.from(this.inMemoryPlatformAdmins.values()).map(d => {
      const copy = { ...d };
      delete copy.passwordHash;
      return copy;
    });

    // Ensure default test admin is present
    if (!list.some(a => a.email === 'admin@platform.test')) {
      list.unshift({
        id: 'usr_admin_test_01',
        email: 'admin@platform.test',
        roles: ['PLATFORM_ADMIN'],
        status: 'ACTIVE',
        securityMetadata: { name: 'Root Platform Administrator' }
      });
    }

    return list;
  }

  // ==========================================
  // ASSET MANAGEMENT FOR TENANTS
  // ==========================================

  async createAsset(tenantKey, assetData, actorUserId) {
    if (!assetData || !assetData.name) {
      const err = new Error('Asset name is required');
      err.statusCode = 400;
      throw err;
    }
    const cleanKey = this.tenantDbManager?.sanitizeTenantKey ? this.tenantDbManager.sanitizeTenantKey(tenantKey) : tenantKey;

    const asset = {
      id: `asset_${cleanKey}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: cleanKey,
      name: assetData.name.trim(),
      type: assetData.type || 'server',
      environment: assetData.environment || 'production',
      criticality: assetData.criticality !== undefined ? assetData.criticality : 'MEDIUM',
      exposure: assetData.exposure || 'internal',
      location: assetData.location || assetData.ipAddress || assetData.hostname || 'us-east-1',
      ipAddress: assetData.ipAddress || '',
      hostname: assetData.hostname || '',
      owner: assetData.owner || 'Security Team',
      projectId: assetData.projectId || null,
      platform: assetData.platform || 'Linux / Container',
      description: assetData.description || '',
      tags: Array.isArray(assetData.tags) ? assetData.tags : [],
      status: assetData.status || 'ACTIVE',
      isActive: assetData.isActive !== false,
      createdBy: actorUserId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (this.tenantDbManager?.client) {
      const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
      await tenantDb.collection('assets').insertOne(asset);

      await tenantDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'asset.created',
        userId: actorUserId,
        resourceType: 'asset',
        resourceId: asset.id,
        details: { name: asset.name, type: asset.type, environment: asset.environment, projectId: asset.projectId },
        timestamp: new Date()
      });
    }

    this.inMemoryAssets.set(asset.id, asset);
    return asset;
  }

  async listAssets(tenantKey, query = {}) {
    const cleanKey = this.tenantDbManager?.sanitizeTenantKey ? this.tenantDbManager.sanitizeTenantKey(tenantKey) : tenantKey;
    if (this.tenantDbManager?.client) {
      const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
      const filter = {};
      if (query.projectId && query.projectId !== 'all') filter.projectId = query.projectId;
      if (query.environment) filter.environment = query.environment;
      if (query.type) filter.type = query.type;
      if (query.status) {
        filter.status = query.status;
      } else {
        filter.status = { $ne: 'DECOMMISSIONED' };
        filter.isActive = { $ne: false };
      }
      let cursor = tenantDb.collection('assets').find(filter).sort({ createdAt: -1 });
      if (query.offset) cursor = cursor.skip(Math.max(0, parseInt(query.offset, 10) || 0));
      if (query.limit) cursor = cursor.limit(Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50)));
      return cursor.toArray();
    }

    let items = Array.from(this.inMemoryAssets.values()).filter(a => a.tenantId === cleanKey);
    if (query.projectId && query.projectId !== 'all') items = items.filter(a => a.projectId === query.projectId);
    if (query.environment) items = items.filter(a => a.environment === query.environment);
    if (query.type) items = items.filter(a => a.type === query.type);
    if (query.status) {
      items = items.filter(a => a.status === query.status);
    } else {
      items = items.filter(a => a.status !== 'DECOMMISSIONED' && a.isActive !== false);
    }
    const offset = query.offset ? Math.max(0, parseInt(query.offset, 10) || 0) : 0;
    const limit = query.limit ? Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50)) : items.length;
    return items.slice(offset, offset + limit);
  }

  async updateAsset(tenantKey, assetId, updates, actorUserId) {
    const cleanKey = this.tenantDbManager?.sanitizeTenantKey ? this.tenantDbManager.sanitizeTenantKey(tenantKey) : tenantKey;
    const ALLOWED_ASSET_FIELDS = [
      'name', 'type', 'criticality', 'environment', 'owner', 'tags',
      'metadata', 'ipAddress', 'hostname', 'macAddress', 'status',
      'isActive', 'projectId'
    ];
    const setFields = { updatedAt: new Date() };
    for (const key of ALLOWED_ASSET_FIELDS) {
      if (updates && updates[key] !== undefined) {
        setFields[key] = updates[key];
      }
    }

    if (this.tenantDbManager?.client) {
      const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
      const result = await tenantDb.collection('assets').findOneAndUpdate(
        { id: assetId },
        { $set: setFields },
        { returnDocument: 'after' }
      );
      if (!result) {
        const err = new Error(`Asset "${assetId}" not found`);
        err.statusCode = 404;
        throw err;
      }

      await tenantDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'asset.updated',
        userId: actorUserId,
        actor: { userId: actorUserId },
        resourceType: 'asset',
        resourceId: assetId,
        resource: { type: 'asset', id: assetId },
        details: { updates },
        timestamp: new Date()
      });

      return result;
    }

    const existing = this.inMemoryAssets.get(assetId);
    if (!existing) {
      const err = new Error(`Asset "${assetId}" not found`);
      err.statusCode = 404;
      throw err;
    }
    const updated = { ...existing, ...setFields };
    this.inMemoryAssets.set(assetId, updated);
    return updated;
  }

  async deleteAsset(tenantKey, assetId, actorUserId) {
    const cleanKey = this.tenantDbManager?.sanitizeTenantKey ? this.tenantDbManager.sanitizeTenantKey(tenantKey) : tenantKey;
    const now = new Date();
    if (this.tenantDbManager?.client) {
      const tenantDb = this.tenantDbManager.getTenantDb(cleanKey);
      const result = await tenantDb.collection('assets').findOneAndUpdate(
        { id: assetId },
        { $set: { status: 'DECOMMISSIONED', isActive: false, updatedAt: now, deletedAt: now, deletedBy: actorUserId } },
        { returnDocument: 'after' }
      );
      if (!result) {
        const err = new Error(`Asset "${assetId}" not found`);
        err.statusCode = 404;
        throw err;
      }

      await tenantDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(),
        action: 'asset.deleted',
        userId: actorUserId,
        actor: { userId: actorUserId },
        resourceType: 'asset',
        resourceId: assetId,
        resource: { type: 'asset', id: assetId },
        details: { softDelete: true },
        timestamp: now
      });

      return { success: true, message: 'Asset deleted' };
    }

    const existing = this.inMemoryAssets.get(assetId);
    if (!existing) {
      const err = new Error(`Asset "${assetId}" not found`);
      err.statusCode = 404;
      throw err;
    }
    existing.status = 'DECOMMISSIONED';
    existing.isActive = false;
    existing.updatedAt = now;
    existing.deletedAt = now;
    existing.deletedBy = actorUserId;
    return { success: true, message: 'Asset deleted' };
  }
}

module.exports = TenantManagementService;
