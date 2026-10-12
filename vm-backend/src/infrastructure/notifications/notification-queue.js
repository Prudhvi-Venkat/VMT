'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const logger = require('../../observability/logger');

class NotificationQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 2;
    this.maxRetries = options.maxRetries || 3;
    this.runningCount = 0;
    this.queue = [];
    this.jobs = new Map(); // id -> job
    this.handler = null;
  }

  setHandler(handler) {
    this.handler = handler;
  }

  enqueue({
    tenantId,
    type, // 'USER_ONBOARDING' | 'SCAN_COMPLETED' | 'PASSWORD_RESET'
    recipient,
    payload = {},
    metadata = {}
  }) {
    const job = {
      id: `notif_${crypto.randomUUID()}`,
      tenantId: tenantId || 'platform',
      type,
      recipient,
      payload,
      metadata,
      status: 'QUEUED',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      error: null
    };

    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.emit('job.enqueued', job);

    setImmediate(() => this._processNext());
    return job;
  }

  async _processNext() {
    if (this.runningCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.runningCount++;
    job.status = 'PROCESSING';
    job.attempts++;
    job.updatedAt = new Date();
    this.emit('job.started', job);

    try {
      if (this.handler) {
        await this.handler(job);
      }
      job.status = 'SENT';
      job.sentAt = new Date();
      job.updatedAt = new Date();
      this.emit('job.sent', job);
    } catch (err) {
      job.error = err.message;
      job.updatedAt = new Date();

      if (job.attempts < this.maxRetries) {
        job.status = 'RETRYING';
        this.emit('job.retrying', job);
        const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 10000);
        setTimeout(() => {
          this.queue.push(job);
          this._processNext();
        }, backoffMs).unref();
      } else {
        job.status = 'FAILED';
        logger.error('Notification job permanently failed', {
          jobId: job.id,
          recipient: job.recipient,
          type: job.type,
          error: err.message
        });
        this.emit('job.failed', job);
      }
    } finally {
      this.runningCount--;
      setImmediate(() => this._processNext());
    }
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  listJobs({ tenantId, limit = 50 } = {}) {
    let list = Array.from(this.jobs.values());
    if (tenantId) {
      list = list.filter(j => j.tenantId === tenantId);
    }
    return list.slice(-limit).reverse();
  }
}

module.exports = NotificationQueue;
