'use strict';

const IUserRepository = require('../../domain/interfaces/user-repository.interface');
const { User } = require('../../domain/entities/user.entity');

class MemoryUserRepository extends IUserRepository {
  constructor() {
    super();
    this.users = new Map(); // id -> User
    this.emailIndex = new Map(); // lowercase email -> id
  }

  async findById(id) {
    const raw = this.users.get(id);
    if (!raw) return null;
    return new User(raw);
  }

  async findByEmail(email) {
    if (!email) return null;
    const lower = email.toLowerCase().trim();
    const id = this.emailIndex.get(lower);
    if (!id) return null;
    return this.findById(id);
  }

  async save(user) {
    const lower = user.email.toLowerCase().trim();
    const existingId = this.emailIndex.get(lower);
    if (existingId && existingId !== user.id) {
      const err = new Error(`User with email ${user.email} already exists`);
      err.code = 'DUPLICATE_KEY';
      throw err;
    }

    const copy = new User(user);
    this.users.set(user.id, copy);
    this.emailIndex.set(lower, user.id);
    return new User(copy);
  }

  async update(id, updates) {
    const existing = this.users.get(id);
    if (!existing) {
      throw new Error(`User ${id} not found`);
    }

    const merged = { ...existing, ...updates, updatedAt: new Date() };
    const updatedUser = new User(merged);
    this.users.set(id, updatedUser);

    if (updates.email) {
      const oldEmail = existing.email.toLowerCase().trim();
      const newEmail = updates.email.toLowerCase().trim();
      if (oldEmail !== newEmail) {
        this.emailIndex.delete(oldEmail);
        this.emailIndex.set(newEmail, id);
      }
    }
    return new User(updatedUser);
  }

  clear() {
    this.users.clear();
    this.emailIndex.clear();
  }
}

module.exports = MemoryUserRepository;
