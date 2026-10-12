'use strict';

const path = require('path');

class FileTypeDetector {
  /**
   * Detects the type of dependency/manifest/SBOM file using multi-signal heuristics:
   * 1. File name / extension
   * 2. MIME type
   * 3. Content heuristics (JSON fields, XML roots, format patterns)
   */
  static detect({ filename = '', mimeType = '', content = '' }) {
    const ext = path.extname(filename).toLowerCase();
    const base = path.basename(filename).toLowerCase();
    const trimmedContent = (typeof content === 'string' ? content : content.toString('utf8')).trim();

    // 1. Exact filenames
    if (base === 'package.json') return 'package.json';
    if (base === 'package-lock.json') return 'package-lock.json';
    if (base === 'npm-shrinkwrap.json') return 'npm-shrinkwrap.json';
    if (base === 'yarn.lock') return 'yarn.lock';
    if (base === 'pnpm-lock.yaml' || base === 'pnpm-lock.yml') return 'pnpm-lock.yaml';
    if (base === 'pom.xml') return 'pom.xml';

    // 2. Content-based XML detection
    if (trimmedContent.startsWith('<')) {
      if (trimmedContent.includes('<bom') && (trimmedContent.includes('cyclonedx') || trimmedContent.includes('http://cyclonedx.org'))) {
        return 'cyclonedx-xml';
      }
      if (trimmedContent.includes('<spdx') || (trimmedContent.includes('SPDX') && trimmedContent.includes('http://spdx.org'))) {
        return 'spdx-xml';
      }
      if (trimmedContent.includes('<project') && (trimmedContent.includes('xmlns="http://maven.apache.org/POM') || trimmedContent.includes('<modelVersion>'))) {
        return 'pom.xml';
      }
    }

    // 3. Content-based JSON detection
    if (trimmedContent.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmedContent);
        if (parsed.bomFormat === 'CycloneDX' || (parsed.$schema && parsed.$schema.includes('cyclonedx'))) {
          return 'cyclonedx-json';
        }
        if (parsed.spdxVersion || parsed.SPDXID) {
          return 'spdx-json';
        }
        if (parsed.lockfileVersion !== undefined && (parsed.dependencies || parsed.packages)) {
          return 'package-lock.json';
        }
        if (parsed.dependencies || parsed.devDependencies || parsed.peerDependencies || parsed.name) {
          return 'package.json';
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // 4. Extension-based detection
    if (ext === '.csv' || mimeType.includes('csv')) return 'csv';
    if (ext === '.txt' || mimeType.includes('text/plain')) return 'txt';
    if (ext === '.json') {
      if (filename.toLowerCase().includes('cyclonedx')) return 'cyclonedx-json';
      if (filename.toLowerCase().includes('spdx')) return 'spdx-json';
      return 'package.json';
    }
    if (ext === '.xml') {
      if (filename.toLowerCase().includes('cyclonedx')) return 'cyclonedx-xml';
      if (filename.toLowerCase().includes('spdx')) return 'spdx-xml';
      return 'pom.xml';
    }
    if (ext === '.lock') return 'yarn.lock';
    if (ext === '.yaml' || ext === '.yml') return 'pnpm-lock.yaml';

    // 5. TXT fallback if lines look like package list
    if (trimmedContent.length > 0 && !trimmedContent.includes('<') && !trimmedContent.includes('{')) {
      const firstLine = trimmedContent.split('\n')[0].trim();
      if (firstLine.includes(',') && (firstLine.includes('package') || firstLine.includes('name') || firstLine.includes('version'))) {
        return 'csv';
      }
      return 'txt';
    }

    return 'unknown';
  }
}

module.exports = FileTypeDetector;
