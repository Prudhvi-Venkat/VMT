/**
 * Central API Barrel Registry
 * Imports domain APIs (registration side-effects) and re-exports all hooks, types, and ApiError.
 */

// 1. Core API slice & errors
export { apiSlice } from './api-slice';
export { ApiError, isApiError } from './errors';

// 2. Domain APIs
export * from './auth-api';
export * from './system-api';
export * from './preferences-api';
export * from './users-api';
export * from './projects-api';
export * from './assets-api';
export * from './integrations-api';
export * from './audit-api';
export * from './vulnerability-api';
export * from './dashboard-api';
export * from './tenant-admin-api';
export * from './platform-admin-api';
export * from './console-api';
