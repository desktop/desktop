/** Sanitize a proposed branch name by replacing illegal characters. */
export function sanitizedBranchName(name: string): string {
  return name.replace(/[\x00-\x20\x7F~^:?*\[\\|""<>]|@{|\.\.+|^\.|\.$|\.lock$|\/$/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-/g, '')
}
