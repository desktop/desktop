/**
 * Narrow a value to a non-null, non-array object with unknown property values.
 *
 * This does not validate the object's prototype or individual properties.
 */
export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
