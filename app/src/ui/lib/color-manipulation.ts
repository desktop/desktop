interface IParsedRGB {
  red: number
  blue: number
  green: number
  usePound: boolean
}

/**
 * Extracts the red, blue, green values from a hex string into a object.
 *
 * @param hex - a 6 character string that represents a hex value -- #123456 or
 * 123456.
 * Note: Providing a non hex string won't fail, but may not be meaninful.
 * @returns - a IParsedRGB object that houses a parsed red, green, blue and whether the value was prefaced with a #.
 */
function parseHex(hex: string): IParsedRGB {
  let usePound = false

  if (hex[0] === '#') {
    hex = hex.slice(1)
    usePound = true
  }

  // convert rrggbb to decimal
  const num = parseInt(hex, 16)

  return {
    red: num >> 16,
    blue: (num >> 8) & 0x00ff,
    green: num & 0x0000ff,
    usePound,
  }
}

/**
 * Given a number, it caps it at the rgb extremes of 0 and  255.
 * Example:
 *  colorSegment = -1, returns 0.
 *  colorSegment = 256, returns 255.
 *  colorSegment = 100, returns 100.
 *
 * @param colorSegment - number.
 * @returns - a number between 0 and 255 inclusive.
 */
function capColorSegment(colorSegment: number): number {
  return colorSegment > 255 ? 255 : colorSegment < 0 ? 0 : colorSegment
}

/**
 * This method takes a hex value splits it into red, green, blue values and adds
 * the amount number to them. Thus, providing a positive number will lighten the
 * value by pushing the value closer to 255, 255, 255 aka white. Providing a
 * negative number will darken the value by pushing the value closer to 0, 0, 0
 * aka black.
 *
 * Note: Since this caps the red, green, and blue values at 255 and 0, this
 * method will also have a flattening to black or white effect to the color if
 * the color already has a value you near the extremes or the amount provided is
 * rather high/low.
 *
 * @param hex - a 6 character string that represents a hex value -- #123456 or
 * 123456.
 * Note: Providing a non hex string won't fail, but may not be meaninful.
 * @param amount - a number. Positive lightens. Negative darkens.
 * @returns - a hex value. If prefaced with a '#', it will be returnes prefaced
 * with a '#'.
 */
export function lightenDarkenHexColor(hex: string, amount: number) {
  const parsedHex: IParsedRGB = parseHex(hex)

  const red = capColorSegment(parsedHex.red + amount)
  const blue = capColorSegment(parsedHex.blue + amount)
  const green = capColorSegment(parsedHex.green + amount)

  const backToHex = (green | (blue << 8) | (red << 16)).toString(16)
  return (parsedHex.usePound ? '#' : '') + backToHex
}

/**
 * Calculates a luma range 0 to 255 and returns true if > 150.
 *
 * @param hex - a 6 character string that represents a hex value -- #123456 or 123456
 * Note: Providing a non hex string won't fail, but may not be meaninful.
 * @returns Calculates a luma range 0 to 255 and returns true if luma > 150.
 */
export function isHexColorLight(hex: string): boolean {
  const { red, green, blue } = parseHex(hex)

  // The resulting luma value range is 0..255, where 0 is the darkest and 255 is the lightest.
  const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue // per ITU-R BT.709

  return luma > 150
}
