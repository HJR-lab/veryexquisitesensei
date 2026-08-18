/**
 * Canonical public base URL for anything a customer will click.
 *
 * FRONTEND_URL is a developer convenience — it points at a dev server on a
 * laptop. But a local server run against production Supabase sends REAL email
 * to REAL customers, so a localhost value silently ships dead links (this hit
 * two Aug-2026 student-details emails). Never trust the env var blindly:
 * anything that isn't a public https origin falls back to the studio domain.
 */

const CANONICAL_BASE_URL = 'https://club.ves.sg';

// Hosts that only resolve on the machine that sent the email.
const LOCAL_HOST_PATTERN = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local)$/i;

/** Is this a host only reachable from the sending machine / LAN? */
function isLocalHost(hostname) {
  return LOCAL_HOST_PATTERN.test(String(hostname || ''));
}

/**
 * @param {string} url
 * @returns {boolean} true when the URL is safe to put in a customer's inbox
 */
function isPubliclyReachable(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return !isLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Base URL for customer-facing links (no trailing slash).
 * Honours FRONTEND_URL only when it is a public https origin.
 */
function publicBaseUrl() {
  const configured = process.env.FRONTEND_URL || process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (!configured) return CANONICAL_BASE_URL;

  if (!isPubliclyReachable(configured)) {
    console.warn(
      `[PublicUrl] Ignoring unreachable FRONTEND_URL "${configured}" for a customer-facing link — using ${CANONICAL_BASE_URL}`
    );
    return CANONICAL_BASE_URL;
  }
  return configured.replace(/\/+$/, '');
}

/**
 * Rewrite any local-host links in outbound email HTML to the canonical domain.
 * Last line of defence: catches hardcoded links and call sites that never
 * reached publicBaseUrl().
 *
 * @returns {{ html: string, rewritten: string[] }}
 */
function rewriteLocalLinks(html) {
  if (typeof html !== 'string' || !html) return { html, rewritten: [] };

  const rewritten = [];
  const out = html.replace(/https?:\/\/([^\s"'<>)]+)/gi, (match) => {
    let parsed;
    try {
      parsed = new URL(match);
    } catch {
      return match;
    }
    if (!isLocalHost(parsed.hostname)) return match;

    const replacement = CANONICAL_BASE_URL + parsed.pathname + parsed.search + parsed.hash;
    rewritten.push(`${match} -> ${replacement}`);
    return replacement;
  });

  return { html: out, rewritten };
}

module.exports = { CANONICAL_BASE_URL, publicBaseUrl, isPubliclyReachable, rewriteLocalLinks };
