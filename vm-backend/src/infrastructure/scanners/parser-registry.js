'use strict';

const FileTypeDetector = require('./file-type-detector');
const PackageJsonParser = require('./parsers/package-json.parser');
const PackageLockParser = require('./parsers/package-lock.parser');
const YarnLockParser = require('./parsers/yarn-lock.parser');
const PnpmLockParser = require('./parsers/pnpm-lock.parser');
const PomXmlParser = require('./parsers/pom-xml.parser');
const TxtParser = require('./parsers/txt.parser');
const CsvParser = require('./parsers/csv.parser');
const CycloneDxJsonParser = require('./parsers/cyclonedx-json.parser');
const CycloneDxXmlParser = require('./parsers/cyclonedx-xml.parser');
const SpdxJsonParser = require('./parsers/spdx-json.parser');
const SpdxXmlParser = require('./parsers/spdx-xml.parser');

class ParserRegistry {
  constructor(options = {}) {
    this.maxFileSizeMb = options.maxFileSizeMb || parseInt(process.env.SCANNER_MAX_FILE_SIZE_MB || '20', 10);
    this.maxComponents = options.maxComponents || parseInt(process.env.SCANNER_MAX_COMPONENTS || '10000', 10);
    this.maxCsvRows = options.maxCsvRows || parseInt(process.env.SCANNER_MAX_CSV_ROWS || '10000', 10);
    this.maxTxtLines = options.maxTxtLines || parseInt(process.env.SCANNER_MAX_TXT_LINES || '10000', 10);
    this.parserTimeoutMs = options.parserTimeoutMs || parseInt(process.env.SCANNER_MAX_SCAN_DURATION_SECONDS || '300', 10) * 1000;

    this.parsers = [];
    this._registerDefaultParsers();
  }

  _registerDefaultParsers() {
    this.register(new PackageLockParser());
    this.register(new PackageJsonParser());
    this.register(new YarnLockParser());
    this.register(new PnpmLockParser());
    this.register(new PomXmlParser());
    this.register(new CycloneDxJsonParser());
    this.register(new CycloneDxXmlParser());
    this.register(new SpdxJsonParser());
    this.register(new SpdxXmlParser());
    this.register(new CsvParser());
    this.register(new TxtParser());
  }

  register(parser) {
    this.parsers.push(parser);
  }

  /**
   * Selects parser and parses dependency content safely
   */
  async parse({ filename, mimeType, content, buffer }) {
    const rawContent = content !== undefined ? content : (buffer ? buffer.toString('utf8') : '');
    const byteLength = Buffer.byteLength(rawContent, 'utf8');

    // Security check 1: File size limit
    const maxBytes = this.maxFileSizeMb * 1024 * 1024;
    if (byteLength > maxBytes) {
      throw new Error(`FILE_TOO_LARGE: Uploaded file size (${(byteLength / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed ${this.maxFileSizeMb}MB`);
    }

    // Detect format
    const detectedType = FileTypeDetector.detect({ filename, mimeType, content: rawContent });
    const context = {
      filename,
      mimeType,
      content: rawContent,
      fileType: detectedType
    };

    // Find parser that supports context
    let selectedParser = null;
    for (const parser of this.parsers) {
      if (parser.supports(context)) {
        selectedParser = parser;
        break;
      }
    }

    if (!selectedParser) {
      throw new Error(`UNSUPPORTED_FILE_TYPE: No parser found for file: ${filename} (detected: ${detectedType})`);
    }

    // Execute parse with timeout
    let timerId;
    const parsePromise = selectedParser.parse(context);
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('PARSER_TIMEOUT: Parsing operation timed out')), this.parserTimeoutMs);
      if (timerId.unref) timerId.unref();
    });

    let result;
    try {
      result = await Promise.race([parsePromise, timeoutPromise]);
    } finally {
      if (timerId) clearTimeout(timerId);
    }

    // Security check 2: Component count limit
    if (result.components && result.components.length > this.maxComponents) {
      throw new Error(`COMPONENT_LIMIT_EXCEEDED: Extracted component count (${result.components.length}) exceeds limit of ${this.maxComponents}`);
    }

    const components = (result.components || []).map(component => ({
      ...component,
      version: component.version || component.resolvedVersion || component.declaredVersion || component.versionConstraint || ''
    }));

    return {
      fileType: detectedType,
      components,
      warnings: result.warnings || []
    };
  }
}

module.exports = ParserRegistry;
