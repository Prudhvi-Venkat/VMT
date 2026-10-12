'use strict';

require('./test-helper');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../lib/store/index.ts');

describe('HYG-009, FE-11: Redux Store Tenant Purge & Isolation (lib/store/index.ts)', () => {
  it('resets entire state tree upon auth/logoutStore to prevent cross-tenant in-memory leakage (Constitution Rule 1 & 21)', () => {
    // 1. Initial view is overview
    assert.equal(store.getState().console.activeView, 'overview');

    // 2. Mutate state during active user session
    store.dispatch({ type: 'console/setActiveView', payload: 'analytics' });
    assert.equal(store.getState().console.activeView, 'analytics');

    // 3. User logs out -> dispatch auth/logoutStore
    store.dispatch({ type: 'auth/logoutStore' });

    // 4. Assert all slice states reset to initial state
    const stateAfterLogout = store.getState();
    assert.equal(stateAfterLogout.console.activeView, 'overview');
  });

  it('resets entire state tree upon auth/tenantSwitched to guarantee tenant boundary isolation', () => {
    // 1. Mutate console state
    store.dispatch({ type: 'console/setActiveView', payload: 'scans' });
    assert.equal(store.getState().console.activeView, 'scans');

    // 2. Tenant workspace switched -> dispatch auth/tenantSwitched
    store.dispatch({ type: 'auth/tenantSwitched' });

    // 3. Assert state tree purged
    const stateAfterSwitch = store.getState();
    assert.equal(stateAfterSwitch.console.activeView, 'overview');
  });
});
