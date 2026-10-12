'use strict';

const crypto = require('crypto');

class DomainEvent {
  constructor({
    eventId,
    eventType,
    tenantId,
    correlationId,
    causationId = null,
    producer = 'vm-backend',
    schemaVersion = 1,
    occurredAt = null,
    payload = {}
  }) {
    if (!eventType) {
      throw new Error('DomainEvent requires eventType');
    }
    if (!tenantId) {
      throw new Error('DomainEvent requires tenantId');
    }

    this.eventId = eventId || crypto.randomUUID();
    this.eventType = eventType;
    this.schemaVersion = schemaVersion;
    this.tenantId = tenantId;
    this.occurredAt = occurredAt || new Date().toISOString();
    this.correlationId = correlationId || crypto.randomUUID();
    this.causationId = causationId;
    this.producer = producer;
    this.payload = Object.freeze({ ...payload });

    Object.freeze(this);
  }

  toJSON() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      schemaVersion: this.schemaVersion,
      tenantId: this.tenantId,
      occurredAt: this.occurredAt,
      correlationId: this.correlationId,
      causationId: this.causationId,
      producer: this.producer,
      payload: this.payload
    };
  }
}

module.exports = DomainEvent;
