/**
 * Types which can safely be coerced to strings without losing information.
 * As an example `1234.toString()` doesn't lose any information whereas
 * `({ foo: bar }).toString()` does (`[Object object]`).
 */
type HashableType = number | string | boolean | undefined | null

/**
 * Creates a string representation of the provided arguments.
 *
 * This is a helper function used to create a string representation of
 * an object based on its properties for the purposes of simple equality
 * comparisons.
 */
export function createEqualityHash(...items: HashableType[]) {
  return items.join('+')
}
