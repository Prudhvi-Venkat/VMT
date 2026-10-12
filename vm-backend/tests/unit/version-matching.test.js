'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const VersionMatchingService = require('../../src/application/services/version-matching.service');

describe('Version Matching Engine', () => {
  const matcher = new VersionMatchingService();

  it('should evaluate exact version ranges correctly', () => {
    const targeting = {
      strategy: 'range',
      ranges: [
        {
          start_including: '1.3.2',
          end_excluding: '1.7.4'
        }
      ]
    };

    // 1.7.3 is in range [1.3.2, 1.7.4) -> VULNERABLE
    const res1 = matcher.isVulnerable({
      version: '1.7.3',
      versionTargeting: targeting,
      fixedVersions: ['1.7.4']
    });
    assert.equal(res1.isVulnerable, true);

    // 1.7.4 is NOT in range [1.3.2, 1.7.4) because end is exclusive -> NOT VULNERABLE
    const res2 = matcher.isVulnerable({
      version: '1.7.4',
      versionTargeting: targeting,
      fixedVersions: ['1.7.4']
    });
    assert.equal(res2.isVulnerable, false);

    // 1.3.1 is NOT in range -> NOT VULNERABLE
    const res3 = matcher.isVulnerable({
      version: '1.3.1',
      versionTargeting: targeting
    });
    assert.equal(res3.isVulnerable, false);
  });

  it('should correctly match axios 1.7.9 against CVE-2026-25639 targeting', () => {
    // CVE-2026-25639 in components_database:
    // ranges: [ { end_excluding: "0.30.3" }, { start_including: "1.0.0", end_excluding: "1.13.5" } ]
    // fixed: ["0.30.3", "1.13.5"]
    const targeting = {
      strategy: 'range',
      ranges: [
        { end_excluding: '0.30.3' },
        { start_including: '1.0.0', end_excluding: '1.13.5' }
      ]
    };
    const fixed = ['0.30.3', '1.13.5'];

    // 1.7.9 is >= 1.0.0 and < 1.13.5 -> VULNERABLE
    const res = matcher.isVulnerable({
      version: '1.7.9',
      versionTargeting: targeting,
      fixedVersions: fixed
    });
    assert.equal(res.isVulnerable, true);

    // 1.13.5 is fixed -> NOT VULNERABLE
    const resFixed = matcher.isVulnerable({
      version: '1.13.5',
      versionTargeting: targeting,
      fixedVersions: fixed
    });
    assert.equal(resFixed.isVulnerable, false);

    // 0.20.0 is < 0.30.3 -> VULNERABLE
    const resOld = matcher.isVulnerable({
      version: '0.20.0',
      versionTargeting: targeting,
      fixedVersions: fixed
    });
    assert.equal(resOld.isVulnerable, true);
  });

  it('should evaluate explicit version targeting correctly', () => {
    const targeting = {
      strategy: 'explicit',
      explicit_versions: ['1.5.1'],
      ranges: []
    };

    const res1 = matcher.isVulnerable({
      version: '1.5.1',
      versionTargeting: targeting
    });
    assert.equal(res1.isVulnerable, true);

    const res2 = matcher.isVulnerable({
      version: '1.5.2',
      versionTargeting: targeting
    });
    assert.equal(res2.isVulnerable, false);
  });

  it('should evaluate affects_all_versions targeting', () => {
    const targeting = {
      affects_all_versions: true
    };

    const res1 = matcher.isVulnerable({
      version: '2.0.0',
      versionTargeting: targeting,
      fixedVersions: ['3.0.0']
    });
    assert.equal(res1.isVulnerable, true);

    const res2 = matcher.isVulnerable({
      version: '3.0.1',
      versionTargeting: targeting,
      fixedVersions: ['3.0.0']
    });
    assert.equal(res2.isVulnerable, false);
  });

  it('should compare Maven and generic version strings accurately', () => {
    assert.equal(matcher.compare('1.2.0', '1.2.1', 'maven') < 0, true);
    assert.equal(matcher.compare('1.2.1', '1.2.0', 'maven') > 0, true);
    assert.equal(matcher.compare('2.0.0', '2.0.0', 'maven') === 0, true);
  });
});
