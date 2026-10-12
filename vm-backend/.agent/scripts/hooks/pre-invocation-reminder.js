#!/usr/bin/env node
// .agent/scripts/hooks/pre-invocation-reminder.js
// PreInvocation hook: Injects engineering constitution safety reminders

let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  console.log(JSON.stringify({
    injectSteps: [
      {
        ephemeralMessage: "Constitution Reminder: Enforce strict tenant isolation on every query ({ tenantId: user.tenantId }), preserve ADR-007 state machine rules, and never log secrets."
      }
    ]
  }));
});
