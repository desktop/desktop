/** Sanitize a proposed repository name by replacing illegal characters. */
export function sanitizedRepositoryName(name: string): string {
  return name.replace(/[^\w.-]/g, '-')
}
