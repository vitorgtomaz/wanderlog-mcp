// Only `Authorization: Bearer <cookie>` is accepted. We deliberately do NOT
// accept the cookie via a query parameter: URLs land in reverse-proxy access
// logs, browser history, and `Referer` headers, and the `connect.sid` cookie
// is a long-lived (~1 year) credential. See CLAUDE.md invariant #5 and
// docs/security-hardening/01-drop-token-query-param.md.

export function extractCookie(req: { headers: Record<string, string | undefined> }): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
