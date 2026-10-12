'use strict';

const semver = require('semver');

class VersionMatchingService {
  _extractEpoch(version) {
    if (!version || typeof version !== 'string') return { epoch: 0, rest: '' };
    const trimmed = version.trim().replace(/^[v=]/i, '');
    const m = trimmed.match(/^([0-9]+):(.*)$/);
    if (m) {
      return { epoch: parseInt(m[1], 10), rest: m[2] };
    }
    return { epoch: 0, rest: trimmed };
  }

  /**
   * Normalizes version string for semver evaluation
   */
  _normalizeSemver(version) {
    if (!version || typeof version !== 'string') return null;
    const { rest } = this._extractEpoch(version);
    const valid = semver.valid(rest);
    if (valid) return valid;
    const coerced = semver.coerce(rest);
    return coerced ? coerced.version : null;
  }

  /**
   * Compares two generic non-semver version strings numerically segment by segment
   * @returns {-1 | 0 | 1 | null}
   */
  _compareGeneric(v1, v2) {
    if (v1 === v2) return 0;
    const segs1 = String(v1).split(/[.~+_-]/);
    const segs2 = String(v2).split(/[.~+_-]/);
    const maxLen = Math.max(segs1.length, segs2.length);

    for (let i = 0; i < maxLen; i++) {
      const p1 = segs1[i] || '0';
      const p2 = segs2[i] || '0';

      const n1 = parseInt(p1, 10);
      const n2 = parseInt(p2, 10);

      if (!isNaN(n1) && !isNaN(n2)) {
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
      } else {
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
      }
    }
    return 0;
  }

  /**
   * Safe comparison of two version strings (handles OS package epochs & distros)
   */
  compare(v1, v2, ecosystem = 'npm') {
    const e1 = this._extractEpoch(v1);
    const e2 = this._extractEpoch(v2);

    if (e1.epoch !== e2.epoch) {
      return e1.epoch > e2.epoch ? 1 : -1;
    }

    const s1 = this._normalizeSemver(e1.rest);
    const s2 = this._normalizeSemver(e2.rest);

    if (s1 && s2 && s1 !== s2) {
      return semver.compare(s1, s2);
    }
    return this._compareGeneric(e1.rest, e2.rest);
  }

  /**
   * Evaluates if a given component version is vulnerable according to the CVE's targeting rule
   * @param {Object} params
   * @param {string} params.version - The installed or resolved version
   * @param {Object} params.versionTargeting - The targeting rule ({ strategy, ranges, explicit_versions, affects_all_versions })
   * @param {Array<string>} [params.fixedVersions] - List of fixed versions
   * @param {Array<string>} [params.introducedVersions] - List of introduced versions
   * @param {string} [params.ecosystem] - 'npm', 'maven', etc.
   * @returns {{ isVulnerable: boolean, matchedRange: Object|null, affectedRule: string }}
   */
  isVulnerable({
    version,
    versionTargeting = {},
    fixedVersions = [],
    introducedVersions = [],
    ecosystem = 'npm'
  }) {
    if (!version) {
      return { isVulnerable: false, matchedRange: null, affectedRule: 'NO_VERSION_SPECIFIED' };
    }

    const {
      strategy = 'range',
      ranges = [],
      explicit_versions = [],
      affects_all_versions = false
    } = versionTargeting;

    // Check if the version has already reached a fixed version
    // If installed version is >= a fixed version (where fixed is in the same major/minor branch),
    // we should be careful. Usually, if installedVersion >= min(fixed_versions that are > introduced), not vulnerable.
    const normalizedInstalled = this._normalizeSemver(version);

    // Strategy 1: Explicit vulnerable versions
    if (strategy === 'explicit' || (explicit_versions && explicit_versions.length > 0)) {
      for (const ev of explicit_versions) {
        if (normalizedInstalled) {
          const normEv = this._normalizeSemver(ev);
          if (normEv && semver.eq(normalizedInstalled, normEv)) {
            return {
              isVulnerable: true,
              matchedRange: { explicit: ev },
              affectedRule: `explicit=${ev}`
            };
          }
        } else if (String(ev).trim() === String(version).trim()) {
          return {
            isVulnerable: true,
            matchedRange: { explicit: ev },
            affectedRule: `explicit=${ev}`
          };
        }
      }

      if (strategy === 'explicit') {
        return { isVulnerable: false, matchedRange: null, affectedRule: 'explicit' };
      }
    }

    // Strategy 2: Range-based targeting
    if (ranges && ranges.length > 0) {
      for (const r of ranges) {
        let matchesRange = true;

        if (r.start_including) {
          const cmp = this.compare(version, r.start_including, ecosystem);
          if (cmp < 0) matchesRange = false;
        }

        if (r.start_excluding) {
          const cmp = this.compare(version, r.start_excluding, ecosystem);
          if (cmp <= 0) matchesRange = false;
        }

        if (r.end_including) {
          const cmp = this.compare(version, r.end_including, ecosystem);
          if (cmp > 0) matchesRange = false;
        }

        if (r.end_excluding) {
          const cmp = this.compare(version, r.end_excluding, ecosystem);
          if (cmp >= 0) matchesRange = false;
        }

        if (matchesRange) {
          // Double check: if installed version is >= a fixed version that is >= the range start,
          // then the fix applies.
          let isFixed = false;
          if (Array.isArray(fixedVersions) && fixedVersions.length > 0) {
            for (const fv of fixedVersions) {
              // Ignore git commit SHAs in fixed_versions
              if (/^[a-f0-9]{40}$/i.test(fv)) continue;

              const fvCmp = this.compare(version, fv, ecosystem);
              // If installed version is >= fixed version, and the fixed version is also in or above this range
              if (fvCmp >= 0) {
                // If range specifies an end, and fixed version is >= end, the fix applies
                if (r.end_excluding && this.compare(fv, r.end_excluding, ecosystem) >= 0) {
                  isFixed = true;
                  break;
                }
                if (r.end_including && this.compare(fv, r.end_including, ecosystem) > 0) {
                  isFixed = true;
                  break;
                }
              }
            }
          }

          if (!isFixed) {
            const ruleDesc = [
              r.start_including ? `>=${r.start_including}` : '',
              r.start_excluding ? `>${r.start_excluding}` : '',
              r.end_including ? `<=${r.end_including}` : '',
              r.end_excluding ? `<${r.end_excluding}` : ''
            ].filter(Boolean).join(' ');

            return {
              isVulnerable: true,
              matchedRange: r,
              affectedRule: ruleDesc || 'range'
            };
          }
        }
      }
    }

    // Strategy 3: Affects all versions
    if (affects_all_versions) {
      if (Array.isArray(fixedVersions) && fixedVersions.length > 0) {
        let isFixed = false;
        for (const fv of fixedVersions) {
          if (!/^[a-f0-9]{40}$/i.test(fv) && this.compare(version, fv, ecosystem) >= 0) {
            isFixed = true;
            break;
          }
        }
        if (!isFixed) {
          return {
            isVulnerable: true,
            matchedRange: { all: true },
            affectedRule: 'affects_all_versions'
          };
        }
      } else {
        return {
          isVulnerable: true,
          matchedRange: { all: true },
          affectedRule: 'affects_all_versions'
        };
      }
    }

    return { isVulnerable: false, matchedRange: null, affectedRule: 'not_affected' };
  }
}

module.exports = VersionMatchingService;
