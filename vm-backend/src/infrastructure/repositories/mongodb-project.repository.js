'use strict';

const { Project, ProjectMember } = require('../../domain/entities/project.entity');
const { tenantDbManager } = require('../database/tenant-database-manager');

class MongoProjectRepository {
  constructor(dbManager = tenantDbManager) {
    this.dbManager = dbManager;
  }

  _getProjectsCollection(tenantKey) {
    if (!this.dbManager || !this.dbManager.client) return null;
    return this.dbManager.getTenantDb(tenantKey).collection('projects');
  }

  _getMembersCollection(tenantKey) {
    if (!this.dbManager || !this.dbManager.client) return null;
    return this.dbManager.getTenantDb(tenantKey).collection('project_members');
  }

  async save(tenantKey, project) {
    const col = this._getProjectsCollection(tenantKey);
    if (!col) return project;
    const doc = {
      _id: project.id,
      id: project.id,
      name: project.name,
      key: project.key,
      description: project.description,
      businessUnit: project.businessUnit,
      applicationName: project.applicationName,
      ownerUserId: project.ownerUserId,
      environment: project.environment,
      repositories: project.repositories,
      cloudAccounts: project.cloudAccounts,
      status: project.status,
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };

    await col.updateOne({ id: project.id }, { $set: doc }, { upsert: true });
    return new Project(doc);
  }

  async findById(tenantKey, projectId) {
    const col = this._getProjectsCollection(tenantKey);
    if (!col) return null;
    const doc = await col.findOne({ id: projectId });
    return doc ? new Project(doc) : null;
  }

  async addCloudAccount(tenantKey, projectId, account) {
    const col = this._getProjectsCollection(tenantKey);
    if (!col) return null;
    await col.updateOne(
      { id: projectId },
      { $pull: { cloudAccounts: { integrationId: account.integrationId } }, $set: { updatedAt: new Date() } }
    );
    await col.updateOne(
      { id: projectId },
      { $push: { cloudAccounts: account }, $set: { updatedAt: new Date() } }
    );
    return this.findById(tenantKey, projectId);
  }

  async list(tenantKey, { status, limit = 50, offset = 0 } = {}) {
    const col = this._getProjectsCollection(tenantKey);
    if (!col) return { items: [], total: 0 };
    const query = {};
    if (status) query.status = status;

    const cursor = col.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit);
    const [docs, total] = await Promise.all([
      cursor.toArray(),
      col.countDocuments(query)
    ]);

    return {
      items: docs.map(d => new Project(d)),
      total
    };
  }

  async findByTenant(tenantKey, options = {}) {
    return this.list(tenantKey, options);
  }

  async addMember(tenantKey, projectMember) {
    const col = this._getMembersCollection(tenantKey);
    if (!col) return projectMember;
    const doc = {
      projectId: projectMember.projectId,
      userId: projectMember.userId,
      permissions: projectMember.permissions,
      role: projectMember.role,
      createdAt: projectMember.createdAt,
      updatedAt: projectMember.updatedAt
    };

    await col.updateOne(
      { projectId: projectMember.projectId, userId: projectMember.userId },
      { $set: doc },
      { upsert: true }
    );
    return new ProjectMember(doc);
  }

  async listMembers(tenantKey, projectId) {
    const col = this._getMembersCollection(tenantKey);
    if (!col) return [];
    const docs = await col.find({ projectId }).toArray();
    return docs.map(d => new ProjectMember(d));
  }

  async findMember(tenantKey, projectId, userId) {
    const col = this._getMembersCollection(tenantKey);
    if (!col) return null;
    const doc = await col.findOne({ projectId, userId });
    return doc ? new ProjectMember(doc) : null;
  }

  async listUserProjects(tenantKey, userId) {
    const col = this._getMembersCollection(tenantKey);
    if (!col) return [];
    const memberships = await col.find({ userId }).toArray();
    const projectIds = memberships.map(m => m.projectId);
    if (!projectIds.length) return [];

    const pCol = this._getProjectsCollection(tenantKey);
    if (!pCol) return [];
    const projects = await pCol.find({ id: { $in: projectIds } }).toArray();
    return projects.map(p => new Project(p));
  }
}

module.exports = MongoProjectRepository;
