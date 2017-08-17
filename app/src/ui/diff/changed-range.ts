export interface IRange {
  /** The starting location for the range. */
  readonly location: number

  /** The length of the range. */
  readonly length: number
}

/** Get the maximum position in the range. */
function rangeMax(range: IRange): number {
  return range.location + range.length
}

/** Get the length of the common substring between the two strings. */
function commonLength(
  stringA: string,
  rangeA: IRange,
  stringB: string,
  rangeB: IRange,
  reverse: boolean
): number {
  const max = Math.min(rangeA.length, rangeB.length)
  const startA = reverse ? rangeMax(rangeA) - 1 : rangeA.location
  const startB = reverse ? rangeMax(rangeB) - 1 : rangeB.location
  const stride = reverse ? -1 : 1

  let length = 0
  while (Math.abs(length) < max) {
    if (stringA[startA + length] !== stringB[startB + length]) {
      break
    }

    length += stride
  }

  return Math.abs(length)
}

/** Get the changed ranges in the strings, relative to each other. */
export function relativeChanges(
  stringA: string,
  stringB: string
): { stringARange: IRange; stringBRange: IRange } {
  let bRange = { location: 0, length: stringB.length }
  let aRange = { location: 0, length: stringA.length }

  const prefixLength = commonLength(stringB, bRange, stringA, aRange, false)
  bRange = {
    location: bRange.location + prefixLength,
    length: bRange.length - prefixLength,
  }
  aRange = {
    location: aRange.location + prefixLength,
    length: aRange.length - prefixLength,
  }

  const suffixLength = commonLength(stringB, bRange, stringA, aRange, true)
  bRange.length -= suffixLength
  aRange.length -= suffixLength

  return { stringARange: aRange, stringBRange: bRange }
}
