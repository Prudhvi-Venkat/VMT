'use strict';

require('./test-helper');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedOrigin, parseAllowedOrigins, getDirectBackendUrl, DEFAULT_BACKEND_URL } = require('../lib/config.ts');
const { store } = require('../lib/store/index.ts');
const { setAuthCredentials, logoutStore } = require('../lib/store/slices/auth-slice.ts');

describe('SEC-004, FE-13: Frontend Origin & Session Hardening', () => {
  describe('isTrustedOrigin Allowlisting', () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_TRUSTED_API_ORIGINS;
      delete process.env.NEXT_PUBLIC_API_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    });

    it('trusts relative paths as same-origin', () => {
      assert.equal(isTrustedOrigin('/api/v1/scans'), true);
      assert.equal(isTrustedOrigin('/api/v1/auth/me'), true);
      assert.equal(isTrustedOrigin('/'), true);
    });

    it('trusts standard local development backend endpoints', () => {
      assert.equal(isTrustedOrigin('http://localhost:5000'), true);
      assert.equal(isTrustedOrigin('http://127.0.0.1:5000'), true);
      assert.equal(isTrustedOrigin('http://localhost:3000'), true);
      assert.equal(isTrustedOrigin('http://127.0.0.1:3000'), true);
      assert.equal(isTrustedOrigin('http://localhost:8080'), true);
    });

    it('rejects untrusted external domains and arbitrary endpoints', () => {
      assert.equal(isTrustedOrigin('https://evil-attacker.com'), false);
      assert.equal(isTrustedOrigin('http://phishing.site:5000'), false);
      assert.equal(isTrustedOrigin('https://google.com'), false);
      assert.equal(isTrustedOrigin('http://192.168.1.100:5000'), false);
    });

    it('rejects invalid, empty, or malicious URI schemes', () => {
      assert.equal(isTrustedOrigin(''), false);
      assert.equal(isTrustedOrigin(null), false);
      assert.equal(isTrustedOrigin(undefined), false);
      assert.equal(isTrustedOrigin('javascript:alert(1)'), false);
      assert.equal(isTrustedOrigin('data:text/html,<script>alert(1)</script>'), false);
      assert.equal(isTrustedOrigin('file:///etc/passwd'), false);
      assert.equal(isTrustedOrigin('not-a-valid-url'), false);
    });

    it('honors explicitly configured trusted origins via environment variable', () => {
      process.env.NEXT_PUBLIC_TRUSTED_API_ORIGINS = 'https://api.vulnerability-scanner.enterprise.com, https://eu-api.internal.net';
      
      assert.equal(isTrustedOrigin('https://api.vulnerability-scanner.enterprise.com'), true);
      assert.equal(isTrustedOrigin('https://api.vulnerability-scanner.enterprise.com/api/v1'), true);
      assert.equal(isTrustedOrigin('https://eu-api.internal.net'), true);
      assert.equal(isTrustedOrigin('https://untrusted-api.enterprise.com'), false);
    });
  });

  describe('getDirectBackendUrl Fallback Hardening', () => {
    it('returns default localhost backend URL when no environment variable is set', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      assert.equal(getDirectBackendUrl(), DEFAULT_BACKEND_URL);
    });

    it('safely falls back to DEFAULT_BACKEND_URL if an untrusted origin is configured in environment', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://attacker-controlled.site:9999';
      assert.equal(getDirectBackendUrl(), DEFAULT_BACKEND_URL);
    });

    it('accepts configured backend URL if it is within trusted origins', () => {
      process.env.NEXT_PUBLIC_TRUSTED_API_ORIGINS = 'https://api.prod.myenterprise.com';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.prod.myenterprise.com';
      assert.equal(getDirectBackendUrl(), 'https://api.prod.myenterprise.com');
    });
  });

  describe('Session Storage Hardening (Tab-isolation & LocalStorage Purging)', () => {
    const memorySessionStorage = new Map();
    const memoryLocalStorage = new Map();

    beforeEach(() => {
      memorySessionStorage.clear();
      memoryLocalStorage.clear();

      global.window = {};
      global.sessionStorage = {
        getItem: (k) => memorySessionStorage.get(k) || null,
        setItem: (k, v) => memorySessionStorage.set(k, String(v)),
        removeItem: (k) => memorySessionStorage.delete(k),
        clear: () => memorySessionStorage.clear()
      };
      global.localStorage = {
        getItem: (k) => memoryLocalStorage.get(k) || null,
        setItem: (k, v) => memoryLocalStorage.set(k, String(v)),
        removeItem: (k) => memoryLocalStorage.delete(k),
        clear: () => memoryLocalStorage.clear()
      };
    });

    it('persists session credentials to sessionStorage and purges legacy localStorage', () => {
      // Seed legacy storage
      memoryLocalStorage.set('vm_sec_access_token', 'stale_local_token');
      memoryLocalStorage.set('vm_sec_user_principal', '{"id":"stale"}');

      store.dispatch(setAuthCredentials({
        user: {
          id: 'user-001',
          email: 'analyst@acme.test',
          roles: ['END_USER'],
          permissions: ['scans:read'],
          tenantId: 'tenant-acme'
        },
        accessToken: 'fresh_jwt_token_123',
        tenantKey: 'tenant-acme',
        expiresAt: Date.now() + 900000
      }));

      // Assert sessionStorage received the session
      assert.equal(memorySessionStorage.get('vm_sec_access_token'), 'fresh_jwt_token_123');
      const sessionUser = JSON.parse(memorySessionStorage.get('vm_sec_user_principal'));
      assert.equal(sessionUser.id, 'user-001');

      // Assert localStorage was purged of access tokens
      assert.equal(memoryLocalStorage.get('vm_sec_access_token'), undefined);
      assert.equal(memoryLocalStorage.get('vm_sec_user_principal'), undefined);
    });

    it('clears sessionStorage and localStorage upon logoutStore', () => {
      memorySessionStorage.set('vm_sec_access_token', 'active_token');
      memorySessionStorage.set('vm_sec_user_principal', '{"id":"u1"}');
      memoryLocalStorage.set('vm_sec_access_token', 'leak_token');

      store.dispatch(logoutStore());

      assert.equal(memorySessionStorage.get('vm_sec_access_token'), undefined);
      assert.equal(memorySessionStorage.get('vm_sec_user_principal'), undefined);
      assert.equal(memoryLocalStorage.get('vm_sec_access_token'), undefined);
    });
  });
});
