'use strict';

/**
 * Package URL (PURL) value object parser and formatter conforming to standard purl-spec:
 * pkg:<type>/<namespace>/<name>@<version>?<qualifiers>#<subpath>
 */
class PackageUrl {
  constructor({
    type,
    namespace = null,
    name,
    version = null,
    qualifiers = {},
    subpath = null
  }) {
    if (!type || !name) {
      throw new Error('PackageUrl requires type and name');
    }
    this.type = type.toLowerCase();
    this.namespace = namespace;
    this.name = name;
    this.version = version;
    this.qualifiers = qualifiers;
    this.subpath = subpath;
  }

  static parse(purlString) {
    if (!purlString || typeof purlString !== 'string' || !purlString.startsWith('pkg:')) {
      throw new Error(`Invalid PURL string: ${purlString}`);
    }

    let remainder = purlString.slice(4); // remove 'pkg:'
    let subpath = null;
    let qualifiers = {};

    const subpathIdx = remainder.indexOf('#');
    if (subpathIdx !== -1) {
      subpath = decodeURIComponent(remainder.slice(subpathIdx + 1));
      remainder = remainder.slice(0, subpathIdx);
    }

    const qualifierIdx = remainder.indexOf('?');
    if (qualifierIdx !== -1) {
      const qStr = remainder.slice(qualifierIdx + 1);
      remainder = remainder.slice(0, qualifierIdx);
      const pairs = qStr.split('&');
      for (const p of pairs) {
        const [k, v] = p.split('=');
        if (k && v) qualifiers[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }

    let version = null;
    const versionIdx = remainder.lastIndexOf('@');
    if (versionIdx !== -1) {
      version = decodeURIComponent(remainder.slice(versionIdx + 1));
      remainder = remainder.slice(0, versionIdx);
    }

    const slashIdx = remainder.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(`Invalid PURL format, missing type/name separator: ${purlString}`);
    }

    const type = decodeURIComponent(remainder.slice(0, slashIdx));
    const pathPart = remainder.slice(slashIdx + 1);

    const pathSegments = pathPart.split('/').map(decodeURIComponent);
    const name = pathSegments.pop();
    const namespace = pathSegments.length > 0 ? pathSegments.join('/') : null;

    return new PackageUrl({
      type,
      namespace,
      name,
      version,
      qualifiers,
      subpath
    });
  }

  static create({ type, namespace = null, name, version = null, qualifiers = {}, subpath = null }) {
    return new PackageUrl({ type, namespace, name, version, qualifiers, subpath });
  }

  toString() {
    let result = `pkg:${encodeURIComponent(this.type)}/`;
    if (this.namespace) {
      const nsSegments = this.namespace.split('/').map(encodeURIComponent);
      result += `${nsSegments.join('/')}/`;
    }
    result += encodeURIComponent(this.name);
    if (this.version) {
      result += `@${encodeURIComponent(this.version)}`;
    }
    const qKeys = Object.keys(this.qualifiers);
    if (qKeys.length > 0) {
      result += '?';
      result += qKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(this.qualifiers[k])}`).join('&');
    }
    if (this.subpath) {
      result += `#${encodeURIComponent(this.subpath)}`;
    }
    return result;
  }
}

module.exports = PackageUrl;
