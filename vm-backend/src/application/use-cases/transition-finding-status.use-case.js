'use strict';

const { FindingLifecyclePolicy } = require('../../domain/policies/finding-lifecycle-policy');
const { DomainEvent, eventBus, EVENT_TYPES } = require('../../events');

class TransitionFindingStatusUseCase {
  constructor({ scanFindingRepository, auditService = null, eventBusInstance = eventBus } = {}) {
    this.scanFindingRepository = scanFindingRepository;
    this.auditService = auditService;
    this.eventBus = eventBusInstance;
  }

  async execute({
    tenantId,
    findingId,
    status,
    reason = '',
    comment = '',
    changedBy = 'usr_anonymous',
    actorRoles = [],
    correlationId = null
  }) {
    if (!tenantId || !findingId || !status) {
      throw new Error('tenantId, findingId, and status are required');
    }

    const findingResult = await this.scanFindingRepository.getFindingById(tenantId, findingId);
    const currentFinding = findingResult?.finding || findingResult;
    const currentStatus = currentFinding?.status || 'OPEN';

    FindingLifecyclePolicy.validateTransition(currentStatus, status, {
      reason,
      actorRoles
    });

    const updateResult = await this.scanFindingRepository.updateStatus(tenantId, findingId, {
      status,
      reason,
      comment,
      changedBy
    });

    if (this.auditService) {
      await this.auditService.recordEvent({
        actor: { userId: changedBy, roles: actorRoles },
        action: 'finding.status_changed',
        resource: { type: 'finding', id: findingId },
        details: { previousStatus: currentStatus, newStatus: status, reason, comment },
        correlationId
      });
    }

    if (this.eventBus) {
      await this.eventBus.publish(new DomainEvent({
        eventType: EVENT_TYPES.FINDING_STATUS_CHANGED,
        tenantId,
        correlationId,
        payload: {
          findingId,
          previousStatus: currentStatus,
          newStatus: status,
          reason,
          changedBy
        }
      }));
    }

    return updateResult;
  }
}

module.exports = TransitionFindingStatusUseCase;
