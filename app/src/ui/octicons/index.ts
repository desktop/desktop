export {
  OcticonSymbolHeight,
  OcticonSymbolHeights,
  OcticonSymbolName,
  OcticonSymbolSize,
  OcticonSymbolType,
} from './octicons.generated'

export type CustomOcticonSymbolType = {
  /** The symbol name */
  readonly s: string

  /** The symbol width */
  readonly w: number

  /** The symbol height */
  readonly h: number

  /** The symbol SVG paths */
  readonly d: string[]
}

export { Octicon } from './octicon'
export { iconForRepository } from './repository'
export { iconForStatus } from './status'
export { syncClockwise } from './sync-clockwise'
