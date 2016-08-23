/** Sanitize a proposed repository name by replacing illegal characters. */
export default function sanitizedRepositoryName(name: string): string {
  return name.replace(/[^\w.-]/g, '-')
}
