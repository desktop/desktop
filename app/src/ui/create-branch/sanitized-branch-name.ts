/** Sanitize a proposed branch name by replacing illegal characters. */
export function sanitizedBranchName(name: string): string {
  return name.replace(/ /g, '-')
}
