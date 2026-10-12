'use strict';

const crypto = require('crypto');

const TokenGenerator = {
  generateId() {
    return crypto.randomUUID();
  },

  generateRefreshToken() {
    // 256 bits of entropy in hex
    return crypto.randomBytes(32).toString('hex');
  }
};

module.exports = TokenGenerator;
