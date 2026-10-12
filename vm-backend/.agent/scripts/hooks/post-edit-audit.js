#!/usr/bin/env node
// .agent/scripts/hooks/post-edit-audit.js
// PostToolUse hook: Receives edit completion notifications and returns {}

let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  // Output required empty JSON object per PostToolUse contract
  console.log(JSON.stringify({}));
});
