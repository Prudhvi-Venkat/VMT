/**
 * Global Configuration & Environmental Constants
 * Trusted API origin allowlisting and environmental configuration (SEC-004, FE-13).
 */

export const DEFAULT_BACKEND_URL = 'http://localhost:5000';

const TRUSTED_LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function parseAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]);

  if (typeof window !== 'undefined' && window.location?.origin) {
    allowed.add(window.location.origin);
  }

  const customOrigins = process.env.NEXT_PUBLIC_TRUSTED_API_ORIGINS;
  if (customOrigins) {
    for (const o of customOrigins.split(',')) {
      const trimmed = o.trim();
      if (trimmed) {
        try {
          const parsed = new URL(trimmed);
          allowed.add(parsed.origin);
        } catch {
          // ignore malformed custom origin
        }
      }
    }
  }

  return allowed;
}

export function isTrustedOrigin(urlStr?: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  // Relative paths are always same-origin / trusted
  if (urlStr.startsWith('/')) return true;

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const trustedOrigins = parseAllowedOrigins();
    if (trustedOrigins.has(parsed.origin)) {
      return true;
    }

    if (TRUSTED_LOCAL_HOSTNAMES.has(parsed.hostname)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function sanitizeBackendUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_BACKEND_URL;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isTrustedOrigin(parsed.origin)) {
      return trimmed.replace(/\/+$/, '');
    }
  } catch {
    // Invalid URL format
  }
  return DEFAULT_BACKEND_URL;
}

export function getDirectBackendUrl(): string {
  return sanitizeBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL);
}

export const DIRECT_BACKEND_URL = sanitizeBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL);
