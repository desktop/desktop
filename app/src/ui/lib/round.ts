/**
 * Round a number to the desired number of decimals.
 *
 * This differs from toFixed in that it toFixed returns a
 * string which will always contain exactly two decimals even
 * though the number might be an integer.
 *
 * See https://stackoverflow.com/a/11832950/2114
 *
 * @param value     The number to round to the number of
 *                  decimals specified
 * @param decimals  The number of decimals to round to. Ex:
 *                  2: 1234.56789 => 1234.57
 *                  3: 1234.56789 => 1234.568
 */
export function round(value: number, decimals: number) {
  if (decimals <= 0) {
    return Math.round(value)
  }

  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}
