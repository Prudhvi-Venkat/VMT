'use strict';

/**
 * Interface definition for User Repository
 */
class IUserRepository {
  async findById(id) { throw new Error('Not implemented'); }
  async findByEmail(email) { throw new Error('Not implemented'); }
  async save(user) { throw new Error('Not implemented'); }
  async update(id, updates) { throw new Error('Not implemented'); }
}

module.exports = IUserRepository;
