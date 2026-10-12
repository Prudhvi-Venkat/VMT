'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DomainEvent = require('../../src/events/domain-event');
const { EventBus } = require('../../src/events/event-bus');
const EVENT_TYPES = require('../../src/events/event-types');

describe('Domain Event System (ADR-006)', () => {
  it('should create an immutable canonical DomainEvent envelope', () => {
    const event = new DomainEvent({
      eventType: EVENT_TYPES.SCAN_COMPLETED,
      tenantId: 'tenant_acme',
      correlationId: 'corr_12345',
      causationId: 'cause_001',
      payload: { scanId: 'scan_999', findingCount: 15 }
    });

    assert.ok(event.eventId);
    assert.equal(event.eventType, 'scan.completed');
    assert.equal(event.schemaVersion, 1);
    assert.equal(event.tenantId, 'tenant_acme');
    assert.equal(event.correlationId, 'corr_12345');
    assert.equal(event.causationId, 'cause_001');
    assert.equal(event.producer, 'vm-backend');
    assert.equal(event.payload.scanId, 'scan_999');
    assert.equal(event.payload.findingCount, 15);
    assert.ok(event.occurredAt);

    // Verify immutability
    assert.throws(() => {
      event.eventType = 'tampered.event';
    });
  });

  it('should throw error when missing eventType or tenantId', () => {
    assert.throws(() => {
      new DomainEvent({ tenantId: 'tenant_acme' });
    }, /requires eventType/);

    assert.throws(() => {
      new DomainEvent({ eventType: 'scan.created' });
    }, /requires tenantId/);
  });

  it('should publish and subscribe to exact event types', async () => {
    const bus = new EventBus();
    const received = [];

    bus.subscribe(EVENT_TYPES.FINDING_CREATED, (event) => {
      received.push(event);
    });

    const event1 = new DomainEvent({
      eventType: EVENT_TYPES.FINDING_CREATED,
      tenantId: 'tenant_test',
      payload: { findingId: 'find_01' }
    });

    const result = await bus.publish(event1);
    assert.equal(result.delivered, 1);
    assert.equal(received.length, 1);
    assert.equal(received[0].payload.findingId, 'find_01');
  });

  it('should support wildcard subscriptions (e.g. scan.*)', async () => {
    const bus = new EventBus();
    const scanEvents = [];

    bus.subscribe('scan.*', (event) => {
      scanEvents.push(event.eventType);
    });

    await bus.publish(new DomainEvent({
      eventType: EVENT_TYPES.SCAN_CREATED,
      tenantId: 'tenant_test'
    }));

    await bus.publish(new DomainEvent({
      eventType: EVENT_TYPES.SCAN_COMPLETED,
      tenantId: 'tenant_test'
    }));

    await bus.publish(new DomainEvent({
      eventType: EVENT_TYPES.FINDING_CREATED,
      tenantId: 'tenant_test'
    }));

    assert.equal(scanEvents.length, 2);
    assert.deepEqual(scanEvents, ['scan.created', 'scan.completed']);
  });

  it('should deduplicate re-published events for idempotent handlers', async () => {
    const bus = new EventBus();
    let handledCount = 0;

    bus.subscribe(EVENT_TYPES.USER_CREATED, () => {
      handledCount++;
    }, { name: 'analytics-sync', idempotent: true });

    const event = new DomainEvent({
      eventId: 'evt_fixed_uuid_001',
      eventType: EVENT_TYPES.USER_CREATED,
      tenantId: 'tenant_test'
    });

    await bus.publish(event);
    await bus.publish(event); // Duplicate delivery

    assert.equal(handledCount, 1);
  });

  it('should isolate handler errors without crashing other listeners', async () => {
    const bus = new EventBus();
    let successHandlerFired = false;

    bus.subscribe(EVENT_TYPES.ASSET_CREATED, () => {
      throw new Error('Listener internal failure');
    }, { name: 'failing-listener', throwOnError: false });

    bus.subscribe(EVENT_TYPES.ASSET_CREATED, () => {
      successHandlerFired = true;
    }, { name: 'working-listener' });

    const event = new DomainEvent({
      eventType: EVENT_TYPES.ASSET_CREATED,
      tenantId: 'tenant_test',
      payload: { assetId: 'ast_1' }
    });

    const result = await bus.publish(event);
    assert.equal(result.delivered, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(successHandlerFired, true);
  });
});
