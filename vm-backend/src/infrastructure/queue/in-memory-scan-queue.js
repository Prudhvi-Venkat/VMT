'use strict';

const EventEmitter = require('events');
const logger = require('../../observability/logger');

class InMemoryScanQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 2;
    this.runningCount = 0;
    this.queue = [];
    this.handler = null;
  }

  setHandler(handler) {
    this.handler = handler;
  }

  async enqueue(job) {
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
    this.emit('job.started', job);

    try {
      if (this.handler) {
        await this.handler(job);
      }
      this.emit('job.completed', job);
    } catch (err) {
      logger.error('Scan job execution failed', {
        scanId: job.scanId,
        error: err.message,
        stack: err.stack
      });
      this.emit('job.failed', { job, error: err });
    } finally {
      this.runningCount--;
      setImmediate(() => this._processNext());
    }
  }

  getQueueLength() {
    return this.queue.length;
  }

  getRunningCount() {
    return this.runningCount;
  }
}

module.exports = InMemoryScanQueue;
