#!/usr/bin/env node
// .agent/scripts/hooks/security-guard.js
// PreToolUse hook: Inspects run_command calls for dangerous/destructive commands

let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = input ? JSON.parse(input) : {};
    const command = data?.toolCall?.args?.CommandLine || '';

    // Patterns that are potentially dangerous or destructive
    const dangerousPatterns = [
      /\brm\s+-rf\s+[\/\\]/i,
      /\bformat\s+[a-z]:/i,
      /\bdropdatabase\b/i,
      /\bgit\s+reset\s+--hard\b/i,
      /\bgit\s+clean\s+-fdx\b/i,
      /\bgit\s+push\s+.*--force\b/i,
      /\bdel\s+\/f\s+\/s\s+\/q\s+[c-z]:\\/i
    ];

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(command));

    if (isDangerous) {
      console.log(JSON.stringify({
        decision: 'ask',
        reason: `Potential high-risk operation detected in command: "${command}". Confirmation required.`
      }));
    } else {
      console.log(JSON.stringify({
        decision: 'allow'
      }));
    }
  } catch (err) {
    console.log(JSON.stringify({ decision: 'allow' }));
  }
});
