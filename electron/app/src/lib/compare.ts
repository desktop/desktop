/**
 * Compares the two values given and returns a value indicating whether
 * one is greater than the other. When the return value is used in a sort
 * operation the comparands will be sorted in ascending order
 *
 * Used for simplifying custom comparison logic when sorting arrays
 * of complex types.
 *
 * The greater than/less than checks are implemented using standard
 * javascript comparison operators and will only provide a meaningful
 * sort value for types which javascript can compare natively. See
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators
 *
 * This method can be chained using `||` for more complex sorting
 * logic. Example:
 *
 * ```ts
 * arr.sort(
 *  (x, y) =>
 *    compare(x.firstName, y.firstName) || compare(x.lastName, y.lastName)
 * )
 * ```
 *
 */
export function compare<T>(x: T, y: T): number {
  if (x < y) {
    return -1
  }
  if (x > y) {
    return 1
  }

  return 0
}

/**
 * Compares the two values given and returns a value indicating whether
 * one is greater than the other. When the return value is used in a sort
 * operation the comparands will be sorted in descending order
 *
 * Used for simplifying custom comparison logic when sorting arrays
 * of complex types.
 *
 * The greater than/less than checks are implemented using standard
 * javascript comparison operators and will only provide a meaningful
 * sort value for types which javascript can compare natively. See
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators
 *
 * This method can be chained using `||` for more complex sorting
 * logic. Ex
 *
 *  arr.sort((x, y) => compare(x.firstName, y.firstName) || compare(x.lastName, y.lastName))
 *
 */
export function compareDescending<T>(x: T, y: T): number {
  if (x < y) {
    return 1
  }
  if (x > y) {
    return -1
  }

  return 0
}

/**
 * Compares the two strings in a case-insensitive manner and returns a value
 * indicating whether these are equal
 */
export function caseInsensitiveEquals(x: string, y: string): boolean {
  return x.toLowerCase() === y.toLowerCase()
}

/**
 * Compares the two strings in a case-insensitive manner and returns a value
 * indicating whether one is greater than the other. When the return value is
 * used in a sort operation the comparands will be sorted in ascending order.
 */
export function caseInsensitiveCompare(x: string, y: string): number {
  return compare(x.toLowerCase(), y.toLowerCase())
}

/**
 * Compares the two strings in a case-insensitive manner and returns a value
 * indicating whether one is greater than the other. When the return value is
 * used in a sort operation the comparands will be sorted in descending order.
 */
export function caseInsensitiveCompareDescending(x: string, y: string): number {
  return compareDescending(x.toLowerCase(), y.toLowerCase())
}
