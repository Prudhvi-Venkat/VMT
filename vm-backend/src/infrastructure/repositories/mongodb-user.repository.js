'use strict';

const IUserRepository = require('../../domain/interfaces/user-repository.interface');
const { User } = require('../../domain/entities/user.entity');
const { getDb } = require('../database/mongodb');

class MongoUserRepository extends IUserRepository {
  constructor(db = null, collectionName = 'users') {
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
    return new User(doc);
  }

  async findByEmail(email) {
    if (!email) return null;
    const doc = await this.collection.findOne({ email: email.toLowerCase().trim() });
    if (!doc) return null;
    return new User(doc);
  }

  async save(user) {
    const doc = { ...user };
    delete doc._id;
    await this.collection.updateOne(
      { id: user.id },
      { $set: doc },
      { upsert: true }
    );
    return new User(user);
  }

  async update(id, updates) {
    const doc = { ...updates, updatedAt: new Date() };
    delete doc._id;
    const result = await this.collection.findOneAndUpdate(
      { id },
      { $set: doc },
      { returnDocument: 'after' }
    );
    if (!result) {
      throw new Error(`User ${id} not found`);
    }
    return new User(result);
  }
}

module.exports = MongoUserRepository;
