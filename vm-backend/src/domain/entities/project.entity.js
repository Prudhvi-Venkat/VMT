'use strict';

const ProjectStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DISABLED: 'DISABLED'
};

class Project {
  constructor({
    id,
    _id,
    name,
    key,
    description = '',
    department = '',
    businessUnit = '',
    applicationName = '',
    ownerUserId = null,
    startDate = null,
    endDate = null,
    stage = 'DEV',
    cloudProvider = 'NONE',
    cloudMetadata = {},
    environment = ['production'],
    repositories = [],
    cloudAccounts = [],
    status = ProjectStatus.ACTIVE,
    membersCount = 0,
    createdBy = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.id = id || _id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this._id = this.id;
    this.name = name;
    this.key = key ? key.trim().toUpperCase() : this.name.substring(0, 6).toUpperCase();
    this.description = description;
    this.department = department || businessUnit || '';
    this.businessUnit = this.department;
    this.applicationName = applicationName || this.name;
    this.ownerUserId = ownerUserId;
    this.startDate = startDate ? new Date(startDate) : null;
    this.endDate = endDate ? new Date(endDate) : null;
    this.stage = stage || 'DEV';
    this.cloudProvider = cloudProvider || 'NONE';
    this.cloudMetadata = cloudMetadata || {};
    this.environment = Array.isArray(environment) ? environment : [environment];
    this.repositories = repositories || [];
    this.cloudAccounts = cloudAccounts || [];
    this.status = status;
    this.membersCount = membersCount || 0;
    this.createdBy = createdBy;
    this.createdAt = createdAt ? new Date(createdAt) : new Date();
    this.updatedAt = updatedAt ? new Date(updatedAt) : new Date();
  }
}

class ProjectMember {
  constructor({
    projectId,
    userId,
    permissions = ['scans:read', 'scans:create', 'findings:read', 'findings:update'],
    role = 'MEMBER',
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.projectId = projectId;
    this.userId = userId;
    this.permissions = permissions;
    this.role = role;
    this.createdAt = createdAt ? new Date(createdAt) : new Date();
    this.updatedAt = updatedAt ? new Date(updatedAt) : new Date();
  }
}

module.exports = {
  Project,
  ProjectMember,
  ProjectStatus
};
