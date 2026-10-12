'use strict';

const { RolePermissionPolicy } = require('./role-permission-policy');

const PolicyDecisionReason = {
  PERMITTED: 'PERMITTED',
  MISSING_CONTEXT: 'MISSING_CONTEXT',
  SUBJECT_INACTIVE: 'SUBJECT_INACTIVE',
  TENANT_CONTEXT_REQUIRED: 'TENANT_CONTEXT_REQUIRED',
  AMBIGUOUS_RESOURCE_TENANT: 'AMBIGUOUS_RESOURCE_TENANT',
  CROSS_TENANT_FORBIDDEN: 'CROSS_TENANT_FORBIDDEN',
  DUAL_CONTROL_VIOLATION: 'DUAL_CONTROL_VIOLATION',
  SELF_ADMIN_FORBIDDEN: 'SELF_ADMIN_FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  PROJECT_NOT_ASSIGNED: 'PROJECT_NOT_ASSIGNED',
  RESOURCE_IMMUTABLE: 'RESOURCE_IMMUTABLE',
  ELEVATED_ROLE_REQUIRED: 'ELEVATED_ROLE_REQUIRED',
  DEFAULT_DENY: 'DEFAULT_DENY'
};

const GLOBAL_RESOURCE_TYPES = new Set([
  'vulnerability',
  'vulnerability_intelligence',
  'cve',
  'system',
  'platform',
  'intel'
]);

class AuthorizationPolicyEngine {
  constructor(options = {}) {
    this.policyVersion = options.policyVersion || '2.0';
    this.strictDualControl = options.strictDualControl !== false;
  }

  /**
   * Deterministic evaluation of access request context.
   * Precedence order:
   * 1. Deny-Override / Fail-Closed on missing context or inactive subject
   * 2. Tenant Boundary Isolation
   * 3. Separation of Duties / Dual-Control
   * 4. RBAC (Roles & Permissions)
   * 5. ABAC (Project assignment, lifecycle state, criticality)
   * 6. Default Deny
   *
   * @param {Object} context
   * @param {Object} context.subject - Authenticated principal attributes
   * @param {string} context.action - Requested operation/permission
   * @param {Object} [context.resource] - Target resource attributes
   * @param {Object} [context.environment] - Environmental context (ip, timestamp, etc.)
   * @returns {{ allowed: boolean, reason: string, decisionDetails: Object }}
   */
  evaluate({ subject, action, resource = {}, environment = {} } = {}) {
    const decisionDetails = {
      policyVersion: this.policyVersion,
      subjectId: subject?.userId || subject?.id || null,
      action: action || null,
      resourceType: resource?.type || null,
      resourceId: resource?.id || null,
      evaluatedAt: new Date().toISOString()
    };

    // 1. Deny-Override: Validate mandatory inputs
    if (!subject || !action || typeof action !== 'string') {
      return {
        allowed: false,
        reason: PolicyDecisionReason.MISSING_CONTEXT,
        decisionDetails: { ...decisionDetails, rule: 'FAIL_CLOSED_INPUT_VALIDATION' }
      };
    }

    // Fail closed if subject status is not ACTIVE
    if (subject.status && subject.status !== 'ACTIVE') {
      return {
        allowed: false,
        reason: PolicyDecisionReason.SUBJECT_INACTIVE,
        decisionDetails: { ...decisionDetails, rule: 'SUBJECT_STATUS_CHECK', status: subject.status }
      };
    }

    const isPlatformSubject = subject.scope === 'platform' &&
      Array.isArray(subject.roles) &&
      subject.roles.includes('PLATFORM_ADMIN');

    // 2. Tenant Boundary Isolation (SEC-001)
    if (!isPlatformSubject) {
      const subjectTenantId = subject.tenantId;
      if (!subjectTenantId || typeof subjectTenantId !== 'string' || !subjectTenantId.trim()) {
        return {
          allowed: false,
          reason: PolicyDecisionReason.TENANT_CONTEXT_REQUIRED,
          decisionDetails: {
            ...decisionDetails,
            rule: 'TENANT_ISOLATION_BOUNDARY_SUBJECT_CONTEXT_REQUIRED'
          }
        };
      }

      const isGlobalResource = resource.type && GLOBAL_RESOURCE_TYPES.has(resource.type);
      if (!isGlobalResource) {
        const resourceTenantId = resource.tenantId;
        if (!resourceTenantId || typeof resourceTenantId !== 'string' || !resourceTenantId.trim()) {
          return {
            allowed: false,
            reason: PolicyDecisionReason.AMBIGUOUS_RESOURCE_TENANT,
            decisionDetails: {
              ...decisionDetails,
              rule: 'TENANT_ISOLATION_BOUNDARY_AMBIGUOUS_RESOURCE_TENANT',
              resourceType: resource.type || null
            }
          };
        }

        if (resourceTenantId !== subjectTenantId) {
          return {
            allowed: false,
            reason: PolicyDecisionReason.CROSS_TENANT_FORBIDDEN,
            decisionDetails: {
              ...decisionDetails,
              rule: 'TENANT_ISOLATION_BOUNDARY',
              subjectTenantId,
              resourceTenantId
            }
          };
        }
      }
    }

    // 3. Separation of Duties & Dual-Control (SEC-006)
    // 3a. Self-administration restriction: User cannot deactivate or delete themselves
    if ((action === 'users:delete' || action === 'users:deactivate' || action === 'tenant:users:write') &&
        resource.type === 'user' && resource.id &&
        (resource.id === subject.userId || resource.id === subject.id)) {
      return {
        allowed: false,
        reason: PolicyDecisionReason.SELF_ADMIN_FORBIDDEN,
        decisionDetails: { ...decisionDetails, rule: 'SEPARATION_OF_DUTIES_SELF_ADMIN' }
      };
    }

    // 3b. Dual-Control on Exemption/Exception approvals and resolution
    if (this.strictDualControl &&
        (action === 'exemptions:approve' || action === 'exceptions:approve' || action === 'findings:resolve')) {
      const requesterId = resource.requestedBy || resource.createdBy;
      const approverId = subject.userId || subject.id;
      // Requester cannot approve their own exemption/exception unless platform admin
      if (requesterId && approverId && requesterId === approverId && !isPlatformSubject) {
        return {
          allowed: false,
          reason: PolicyDecisionReason.DUAL_CONTROL_VIOLATION,
          decisionDetails: {
            ...decisionDetails,
            rule: 'SEPARATION_OF_DUTIES_DUAL_CONTROL',
            requesterId,
            approverId
          }
        };
      }
    }

    // 4. RBAC Evaluation
    // Resolve user permissions from roles if permissions array is not provided directly
    let permissions = subject.permissions;
    if (!Array.isArray(permissions) && Array.isArray(subject.roles)) {
      permissions = RolePermissionPolicy.getPermissionsForRoles(subject.roles);
    }
    if (!Array.isArray(permissions)) {
      permissions = [];
    }

    const hasRbacPermission = RolePermissionPolicy.hasPermission(permissions, action);
    if (!hasRbacPermission) {
      return {
        allowed: false,
        reason: PolicyDecisionReason.INSUFFICIENT_PERMISSIONS,
        decisionDetails: {
          ...decisionDetails,
          rule: 'RBAC_PERMISSION_CHECK',
          requiredPermission: action,
          assignedRoles: subject.roles || []
        }
      };
    }

    // 5. ABAC: Attribute-Based Access Control
    // 5a. Resource Lifecycle Immutability: Archived or Deleted resources reject mutative actions
    const isMutative = action.includes(':write') || action.includes(':update') ||
                       action.includes(':delete') || action.includes(':resolve') ||
                       action.includes(':assign') || action.includes(':close');
    if (isMutative && (resource.status === 'ARCHIVED' || resource.lifecycleState === 'ARCHIVED' || resource.status === 'DELETED')) {
      return {
        allowed: false,
        reason: PolicyDecisionReason.RESOURCE_IMMUTABLE,
        decisionDetails: {
          ...decisionDetails,
          rule: 'RESOURCE_LIFECYCLE_IMMUTABILITY',
          lifecycleState: resource.status || resource.lifecycleState
        }
      };
    }

    // 5b. Project Scoping for Project-Scoped Roles (e.g. END_USER, SECURITY_ANALYST)
    if (!isPlatformSubject && resource.projectId && Array.isArray(subject.roles)) {
      const isTenantSuperAdmin = subject.roles.includes('TENANT_SUPER_ADMIN') || subject.roles.includes('SECURITY_MANAGER');
      if (!isTenantSuperAdmin) {
        const assignedProjects = subject.assignedProjectIds || [];
        const isAssigned = assignedProjects.includes('*') || assignedProjects.includes(resource.projectId);
        if (!isAssigned) {
          return {
            allowed: false,
            reason: PolicyDecisionReason.PROJECT_NOT_ASSIGNED,
            decisionDetails: {
              ...decisionDetails,
              rule: 'ABAC_PROJECT_MEMBERSHIP_CONSTRAINT',
              resourceProjectId: resource.projectId,
              assignedProjectIds: assignedProjects
            }
          };
        }
      }
    }

    // 5c. Asset Criticality Guard: Deletion of Tier-1 Critical assets requires elevated role
    if (resource.type === 'asset' && resource.criticality === 'TIER_1_CRITICAL' && action === 'assets:delete') {
      const isElevated = isPlatformSubject || (Array.isArray(subject.roles) && subject.roles.includes('TENANT_SUPER_ADMIN'));
      if (!isElevated) {
        return {
          allowed: false,
          reason: PolicyDecisionReason.ELEVATED_ROLE_REQUIRED,
          decisionDetails: {
            ...decisionDetails,
            rule: 'ABAC_ASSET_CRITICALITY_GUARD',
            criticality: resource.criticality
          }
        };
      }
    }

    // Default Permit when all policy gates succeed
    return {
      allowed: true,
      reason: PolicyDecisionReason.PERMITTED,
      decisionDetails: {
        ...decisionDetails,
        rule: 'POLICY_CONJUNCTION_PERMIT'
      }
    };
  }

  /**
   * Convenience boolean evaluator
   */
  can(subject, action, resource, environment) {
    const decision = this.evaluate({ subject, action, resource, environment });
    return decision.allowed;
  }
}

const defaultPolicyEngine = new AuthorizationPolicyEngine();

module.exports = {
  AuthorizationPolicyEngine,
  PolicyDecisionReason,
  GLOBAL_RESOURCE_TYPES,
  policyEngine: defaultPolicyEngine
};
