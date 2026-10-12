'use strict';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class EmailTemplateService {
  static escapeHtml(str) {
    return escapeHtml(str);
  }

  renderUserOnboarding({ name, email, tenantName, temporaryPassword, loginUrl }) {
    const rawName = name || email;
    const subject = `Welcome to ${tenantName || 'Enterprise Security Exposure Platform'}`;
    const text = `Hello ${rawName},\n\nAn account has been provisioned for you in ${tenantName}.\n\nYour username: ${email}\nYour temporary password: ${temporaryPassword}\n\nPlease log in at: ${loginUrl || 'http://localhost:3000/login'} and update your password immediately.\n\nRegards,\nSecurity Operations Team`;
    
    const safeName = escapeHtml(rawName);
    const safeEmail = escapeHtml(email);
    const safeTenantName = escapeHtml(tenantName || 'Security Exposure Platform');
    const safeTempPassword = escapeHtml(temporaryPassword);
    const safeLoginUrl = escapeHtml(loginUrl || 'http://localhost:3000/login');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to ${safeTenantName}</h2>
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>An enterprise security management account has been provisioned for you.</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Username:</strong> ${safeEmail}</p>
          <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${safeTempPassword}</code></p>
        </div>
        <p><a href="${safeLoginUrl}" style="display: inline-block; background-color: #0f172a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500;">Log In to Platform</a></p>
        <p style="font-size: 13px; color: #64748b; margin-top: 30px;">For security, please change your password upon initial login.</p>
      </div>
    `;
    return { subject, text, html };
  }

  renderScanCompleted({ scanId, scanName, status, componentCount, vulnerableCount, findingCount, criticalCount, highCount }) {
    const rawScan = scanName || scanId;
    const subject = `[Scan Completed] ${rawScan} — ${status}`;
    const text = `Scan "${rawScan}" has completed with status ${status}.\n\nComponents scanned: ${componentCount}\nVulnerable components: ${vulnerableCount}\nTotal findings: ${findingCount} (Critical: ${criticalCount}, High: ${highCount})\n\nView details in the vulnerability console.`;
    
    const safeScan = escapeHtml(rawScan);
    const safeStatus = escapeHtml(status);
    const safeCompCount = escapeHtml(componentCount);
    const safeVulnCount = escapeHtml(vulnerableCount);
    const safeFindingCount = escapeHtml(findingCount);
    const safeCritCount = escapeHtml(criticalCount);
    const safeHighCount = escapeHtml(highCount);

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Vulnerability Scan Completed</h2>
        <p>The scan <strong>${safeScan}</strong> has finished processing.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b;">Status</td>
            <td style="padding: 8px 0; font-weight: bold; color: ${status === 'COMPLETED' ? '#16a34a' : '#ea580c'};">${safeStatus}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b;">Components Scanned</td>
            <td style="padding: 8px 0; font-weight: bold;">${safeCompCount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b;">Vulnerable Components</td>
            <td style="padding: 8px 0; font-weight: bold; color: ${vulnerableCount > 0 ? '#dc2626' : '#16a34a'};">${safeVulnCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">Severity Findings</td>
            <td style="padding: 8px 0; font-weight: bold;">
              <span style="color: #dc2626;">Critical: ${safeCritCount}</span> &bull; 
              <span style="color: #ea580c;">High: ${safeHighCount}</span> &bull; 
              <span>Total: ${safeFindingCount}</span>
            </td>
          </tr>
        </table>
      </div>
    `;
    return { subject, text, html };
  }

  renderPasswordReset({ email, resetToken, resetUrl }) {
    const subject = 'Password Reset Request — Enterprise Security Exposure Platform';
    const text = `A password reset was requested for your account (${email}).\n\nYour reset token: ${resetToken}\n\nReset your password at: ${resetUrl}\n\nIf you did not request this, please contact your administrator immediately.`;
    
    const safeEmail = escapeHtml(email);
    const safeResetToken = escapeHtml(resetToken);
    const safeResetUrl = escapeHtml(resetUrl);

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>
        <p>A password reset has been requested for your account (<strong>${safeEmail}</strong>).</p>
        <p>Click below or paste your reset token to proceed:</p>
        <p><a href="${safeResetUrl}" style="display: inline-block; background-color: #0f172a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
        <p>Or use token: <code>${safeResetToken}</code></p>
        <p style="font-size: 13px; color: #64748b; margin-top: 30px;">This token expires in 1 hour. If you did not make this request, ignore this email.</p>
      </div>
    `;
    return { subject, text, html };
  }
}

EmailTemplateService.escapeHtml = escapeHtml;

module.exports = EmailTemplateService;
