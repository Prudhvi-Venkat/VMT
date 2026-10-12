/**
 * Backwards compatibility barrel for tenant admin APIs.
 * Domain endpoints are split into users-api, projects-api, assets-api, integrations-api, and audit-api.
 */

export * from './users-api';
export * from './projects-api';
export * from './assets-api';
export * from './integrations-api';
export * from './audit-api';
