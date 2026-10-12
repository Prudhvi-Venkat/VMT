'use strict';

const logger = require('../../observability/logger');

class EmailWorker {
  constructor({ notificationQueue, emailTemplateService, transporter = null }) {
    this.notificationQueue = notificationQueue;
    this.emailTemplateService = emailTemplateService;
    this.transporter = transporter;

    if (this.notificationQueue) {
      this.notificationQueue.setHandler(this.handleNotification.bind(this));
    }
  }

  async handleNotification(job) {
    const { type, recipient, payload } = job;
    let templateResult;

    switch (type) {
      case 'USER_ONBOARDING':
        templateResult = this.emailTemplateService.renderUserOnboarding(payload);
        break;
      case 'SCAN_COMPLETED':
        templateResult = this.emailTemplateService.renderScanCompleted(payload);
        break;
      case 'PASSWORD_RESET':
        templateResult = this.emailTemplateService.renderPasswordReset(payload);
        break;
      default:
        templateResult = {
          subject: payload.subject || 'Security Platform Notification',
          text: payload.text || '',
          html: payload.html || ''
        };
    }

    // In production, if transporter is provided, send via SMTP/SES
    if (this.transporter && typeof this.transporter.sendMail === 'function') {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@securityplatform.local',
        to: recipient,
        subject: templateResult.subject,
        text: templateResult.text,
        html: templateResult.html
      });
    } else {
      // Safe logger simulation (never outputs secrets, passwords, or tokens)
      logger.info('Notification sent successfully (simulated transport)', {
        notificationId: job.id,
        type,
        recipient,
        subject: templateResult.subject
      });
    }

    return { delivered: true, recipient, type };
  }
}

module.exports = EmailWorker;
