'use strict';

/**
 * Interface definition for Session Repository
 */
class ISessionRepository {
  async findById(id) { throw new Error('Not implemented'); }
  async findByTokenFamilyId(tokenFamilyId) { throw new Error('Not implemented'); }
  async findActiveByUserId(userId) { throw new Error('Not implemented'); }
  async save(session) { throw new Error('Not implemented'); }
  async update(id, updates) { throw new Error('Not implemented'); }
  async atomicRotateRefreshToken(sessionId, expectedHash, newHash, lastUsedAt) { throw new Error('Not implemented'); }
  async revokeByTokenFamilyId(tokenFamilyId, reason) { throw new Error('Not implemented'); }
  async revokeAllByUserId(userId, reason) { throw new Error('Not implemented'); }
}

module.exports = ISessionRepository;
