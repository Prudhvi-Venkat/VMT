'use strict';

const ISessionRepository = require('../../domain/interfaces/session-repository.interface');
const { Session, SessionStatus } = require('../../domain/entities/session.entity');

class MemorySessionRepository extends ISessionRepository {
  constructor() {
    super();
    this.sessions = new Map(); // id -> Session
  }

  async findById(id) {
    const raw = this.sessions.get(id);
    if (!raw) return null;
    return new Session(raw);
  }

  async findByTokenFamilyId(tokenFamilyId) {
    const results = [];
    for (const s of this.sessions.values()) {
      if (s.tokenFamilyId === tokenFamilyId) {
        results.push(new Session(s));
      }
    }
    return results;
  }

  async findActiveByUserId(userId) {
    const now = new Date();
    const results = [];
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.status === SessionStatus.ACTIVE && s.expiresAt > now) {
        results.push(new Session(s));
      }
    }
    return results;
  }

  async save(session) {
    const copy = new Session(session);
    this.sessions.set(session.id, copy);
    return new Session(copy);
  }

  async update(id, updates) {
    const existing = this.sessions.get(id);
    if (!existing) {
      throw new Error(`Session ${id} not found`);
    }
    const merged = { ...existing, ...updates };
    const updatedSession = new Session(merged);
    this.sessions.set(id, updatedSession);
    return new Session(updatedSession);
  }

  /**
   * Atomic rotation of refresh token for concurrency safety (Section 30).
   * Only succeeds if current refreshTokenHash strictly equals expectedHash.
   */
  async atomicRotateRefreshToken(sessionId, expectedHash, newHash, lastUsedAt = new Date()) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Atomic compare-and-swap
    if (session.status !== SessionStatus.ACTIVE || session.refreshTokenHash !== expectedHash) {
      return null;
    }

    session.refreshTokenHash = newHash;
    session.lastUsedAt = lastUsedAt;
    this.sessions.set(sessionId, session);
    return new Session(session);
  }

  async revokeByTokenFamilyId(tokenFamilyId, reason = 'COMPROMISED') {
    const now = new Date();
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === tokenFamilyId) {
        session.status = SessionStatus.COMPROMISED;
        session.revokedAt = now;
        session.revokeReason = reason;
      }
    }
  }

  async revokeAllByUserId(userId, reason = 'LOGOUT_ALL') {
    const now = new Date();
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === SessionStatus.ACTIVE) {
        session.status = SessionStatus.REVOKED;
        session.revokedAt = now;
        session.revokeReason = reason;
      }
    }
  }

  clear() {
    this.sessions.clear();
  }
}

module.exports = MemorySessionRepository;
