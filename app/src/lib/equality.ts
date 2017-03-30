const deepEquals: (actual: object, expected: object, opts?: { strict: boolean }) => boolean = require('deep-equal')

export function structuralEquals<T extends object>(actual: T, expected: T): boolean {
  return deepEquals(actual, expected, { strict: true })
}
