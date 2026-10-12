'use strict';

const logger = require('../observability/logger');
const DomainEvent = require('./domain-event');

class EventBus {
  constructor({ deduplicationTtlMs = 60000, maxProcessedHistory = 10000 } = {}) {
    this.listeners = new Map();
    this.processedEvents = new Map(); // eventId -> processedTimestamp
    this.deduplicationTtlMs = deduplicationTtlMs;
    this.maxProcessedHistory = maxProcessedHistory;
  }

  subscribe(eventType, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('EventBus subscriber handler must be a function');
    }
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    const registration = {
      handler,
      options: {
        idempotent: options.idempotent !== false,
        name: options.name || handler.name || 'anonymous',
        throwOnError: !!options.throwOnError
      }
    };
    this.listeners.get(eventType).push(registration);

    return () => this.unsubscribe(eventType, handler);
  }

  unsubscribe(eventType, handler) {
    if (!this.listeners.has(eventType)) return;
    const filtered = this.listeners.get(eventType).filter(r => r.handler !== handler);
    if (filtered.length > 0) {
      this.listeners.set(eventType, filtered);
    } else {
      this.listeners.delete(eventType);
    }
  }

  _cleanupProcessedEvents() {
    const now = Date.now();
    for (const [eventId, ts] of this.processedEvents.entries()) {
      if (now - ts > this.deduplicationTtlMs) {
        this.processedEvents.delete(eventId);
      }
    }
    if (this.processedEvents.size > this.maxProcessedHistory) {
      const keysToDelete = Array.from(this.processedEvents.keys()).slice(0, this.maxProcessedHistory / 2);
      for (const k of keysToDelete) {
        this.processedEvents.delete(k);
      }
    }
  }

  async publish(event) {
    if (!(event instanceof DomainEvent)) {
      throw new Error('EventBus.publish requires an instance of DomainEvent');
    }

    this._cleanupProcessedEvents();

    const matchingRegistrations = [];

    // Exact match
    if (this.listeners.has(event.eventType)) {
      matchingRegistrations.push(...this.listeners.get(event.eventType));
    }

    // Wildcard match (e.g. 'scan.*')
    const prefix = event.eventType.split('.')[0] + '.*';
    if (this.listeners.has(prefix)) {
      matchingRegistrations.push(...this.listeners.get(prefix));
    }

    // Global wildcard '*'
    if (this.listeners.has('*')) {
      matchingRegistrations.push(...this.listeners.get('*'));
    }

    if (matchingRegistrations.length === 0) {
      return { delivered: 0, eventId: event.eventId };
    }

    let deliveredCount = 0;
    const errors = [];

    for (const reg of matchingRegistrations) {
      const dedupKey = `${event.eventId}:${reg.options.name}`;
      if (reg.options.idempotent && this.processedEvents.has(dedupKey)) {
        logger.debug?.(`Skipping duplicate event ${event.eventId} for handler ${reg.options.name}`);
        continue;
      }

      try {
        await Promise.resolve(reg.handler(event));
        if (reg.options.idempotent) {
          this.processedEvents.set(dedupKey, Date.now());
        }
        deliveredCount++;
      } catch (err) {
        logger.error(`Error in event handler for ${event.eventType}`, {
          handler: reg.options.name,
          eventId: event.eventId,
          eventType: event.eventType,
          tenantId: event.tenantId,
          error: err.message
        });
        errors.push({ handler: reg.options.name, error: err });
        if (reg.options.throwOnError) {
          throw err;
        }
      }
    }

    return { delivered: deliveredCount, errors, eventId: event.eventId };
  }

  clearListeners() {
    this.listeners.clear();
    this.processedEvents.clear();
  }
}

const defaultEventBus = new EventBus();

module.exports = {
  EventBus,
  eventBus: defaultEventBus
};
