'use strict';

/**
 * vm-app test helper
 * Sets up in-process TypeScript transpilation and module alias (@/) resolution
 * so tests can directly require TypeScript source modules without a separate build step.
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const rootDir = path.resolve(__dirname, '..');
const origResolve = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(rootDir, request.slice(2));
  } else if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const candidateBase = path.resolve(path.dirname(parent.filename), request);
    if (!path.extname(candidateBase)) {
      if (fs.existsSync(candidateBase + '.ts')) request = candidateBase + '.ts';
      else if (fs.existsSync(candidateBase + '.tsx')) request = candidateBase + '.tsx';
      else if (fs.existsSync(candidateBase + '.js')) request = candidateBase + '.js';
      else if (fs.existsSync(path.join(candidateBase, 'index.ts'))) request = path.join(candidateBase, 'index.ts');
      else if (fs.existsSync(path.join(candidateBase, 'index.js'))) request = path.join(candidateBase, 'index.js');
    }
  }

  if (!path.extname(request)) {
    if (fs.existsSync(request + '.ts')) request = request + '.ts';
    else if (fs.existsSync(request + '.tsx')) request = request + '.tsx';
    else if (fs.existsSync(request + '.js')) request = request + '.js';
    else if (fs.existsSync(path.join(request, 'index.ts'))) request = path.join(request, 'index.ts');
    else if (fs.existsSync(path.join(request, 'index.js'))) request = path.join(request, 'index.js');
  }

  return origResolve.call(this, request, parent, isMain, options);
};

function compileTs(module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React
    }
  });
  module._compile(transpiled.outputText, filename);
}

require.extensions['.ts'] = compileTs;
require.extensions['.tsx'] = compileTs;

module.exports = { rootDir };
