// Strip anything that looks like a credential from a string before logging.
// Removes `?token=…` / `&token=…` query params (defence-in-depth — item #01
// already rejects these on input) and any `connect.sid=…` substring that
// might have been captured into an Error.message or Error.stack frame.
// See docs/security-hardening/03-http-error-logging-audit.md.
export function redactSecrets(s: string): string {
  return s
    .replace(/([?&])token=[^&\s"'`]*/gi, "$1token=REDACTED")
    .replace(/connect\.sid=[^;\s"'`]+/gi, "connect.sid=REDACTED");
}
