/**
 * Indicates whether the given string is empty or consists only of white-space
 * characters.
 */
export const isEmptyOrWhitespace = (s: string) =>
  s.length === 0 || !/\S/.test(s)
