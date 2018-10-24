/** Sanitize a proposed repository name by replacing illegal characters. */
export function sanitizedRepositoryName(name: string): string {
  const ranges = [
    '\ud83c[\udf00-\udfff]', // U+1F300 to U+1F3FF
    '\ud83d[\udc00-\ude4f]', // U+1F400 to U+1F64F
    '\ud83d[\ude80-\udeff]', // U+1F680 to U+1F6FF
  ]

  return name
    .replace(new RegExp(ranges.join('|'), 'g'), '-')
    .replace(/[^\w.-]/g, '-')
}
