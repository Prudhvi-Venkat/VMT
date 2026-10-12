'use strict';

/**
 * Interface contract for all dependency manifest / SBOM parsers
 */
class DependencyParser {
  /**
   * Determine if this parser can handle the provided file context
   * @param {Object} context - { filename, mimeType, content, buffer, extension }
   * @returns {boolean}
   */
  supports(context) {
    throw new Error('supports() must be implemented');
  }

  /**
   * Parse the file into canonical components and warnings
   * @param {Object} context - { filename, content, options }
   * @returns {Promise<{ components: Array<Object>, warnings: Array<Object> }>}
   */
  async parse(context) {
    throw new Error('parse() must be implemented');
  }
}

module.exports = DependencyParser;
