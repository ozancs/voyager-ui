// Moonraker streams git's file listings alongside diagnostics. Only diagnostic
// prefixes and explicit failure messages should mark an update as failed.
export function isUpdateError(message) {
  return (
    /^[ \t]*(?:!!|(?:remote: )?(?:fatal|error):|E: |Err:\d+ |(?:dpkg|dpkg-deb): error\b|Errors were encountered while processing\b)/im.test(
      message,
    ) ||
    /^[ \t]*(?:Error (?:updating|recovering|rolling back)\b|Failed to |Transaction [^\r\n]*: Exit Failed\b)/im.test(
      message,
    )
  );
}
