'use strict';

const ISessionRepository = require('../../domain/interfaces/session-repository.interface');
const { Session, SessionStatus } = require('../../domain/entities/session.entity');
const { getDb } = require('../database/mongodb');

class MongoSessionRepository extends ISessionRepository {
  constructor(db = null, collectionName = 'sessions') {
    super();
    this.customDb = db;
    this.collectionName = collectionName;
  }

  get collection() {
    const db = this.customDb || getDb();
    if (!db) throw new Error('MongoDB database not connected');
    return db.collection(this.collectionName);
  }

  async findById(id) {
    const doc = await this.collection.findOne({ id });
    if (!doc) return null;
    return new Session(doc);
  }

  async findByTokenFamilyId(tokenFamilyId) {
    const cursor = this.collection.find({ tokenFamilyId });
    const docs = await cursor.toArray();
    return docs.map(d => new Session(d));
  }

  async findActiveByUserId(userId) {
    const cursor = this.collection.find({
      userId,
      status: SessionStatus.ACTIVE,
      expiresAt: { $gt: new Date() }
    });
    const docs = await cursor.toArray();
    return docs.map(d => new Session(d));
  }

  async save(session) {
    const doc = { ...session };
    delete doc._id;
    await this.collection.updateOne(
      { id: session.id },
      { $set: doc },
      { upsert: true }
    );
    return new Session(session);
  }

  async update(id, updates) {
    const doc = { ...updates };
    delete doc._id;
    const result = await this.collection.findOneAndUpdate(
      { id },
      { $set: doc },
      { returnDocument: 'after' }
    );
    if (!result) {
      throw new Error(`Session ${id} not found`);
    }
    return new Session(result);
  }

  /**
   * Atomic rotation of refresh token for concurrency safety (Section 30).
   * Conditional update succeeds for only ONE concurrent request.
   */
  async atomicRotateRefreshToken(sessionId, expectedHash, newHash, lastUsedAt = new Date()) {
    const result = await this.collection.findOneAndUpdate(
      {
        id: sessionId,
        status: SessionStatus.ACTIVE,
        refreshTokenHash: expectedHash
      },
      {
        $set: {
          refreshTokenHash: newHash,
          lastUsedAt
        }
      },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return new Session(result);
  }

  async revokeByTokenFamilyId(tokenFamilyId, reason = 'COMPROMISED') {
    const now = new Date();
    await this.collection.updateMany(
      { tokenFamilyId },
      {
        $set: {
          status: SessionStatus.COMPROMISED,
          revokedAt: now,
          revokeReason: reason
        }
      }
    );
  }

  async revokeAllByUserId(userId, reason = 'LOGOUT_ALL') {
    const now = new Date();
    await this.collection.updateMany(
      { userId, status: SessionStatus.ACTIVE },
      {
        $set: {
          status: SessionStatus.REVOKED,
          revokedAt: now,
          revokeReason: reason
        }
      }
    );
  }
}

module.exports = MongoSessionRepository;
