/**
 * Format a local branch in the ref syntax, ensuring situations when the branch
 * is ambiguous are handled.
 *
 * Examples:
 *  - master -> refs/heads/master
 *  - heads/Microsoft/master -> refs/heads/Microsoft/master
 *
 * @param branch The local branch name
 */
export function formatAsLocalRef(name: string): string {
  if (name.startsWith('heads/')) {
    // In some cases, Git will report this name explicitly to distingush from
    // a remote ref with the same name - this ensures we format it correctly.
    return `refs/${name}`
  } else {
    // By default Git will drop the heads prefix unless absolutely necessary
    // - include this to ensure the ref is fully qualified.
    return `refs/heads/${name}`
  }
}
