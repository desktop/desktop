export type OcticonSymbolVariant = {
  /** SVG path element data */
  readonly p: string[]

  /** The width of the symbol */
  readonly w: number

  /** The height of the symbol */
  readonly h: number
}

export type OcticonSymbolVariants = Record<PropertyKey, OcticonSymbolVariant>

export type OcticonSymbol = OcticonSymbolVariant | OcticonSymbolVariants

export { Octicon } from './octicon'

export { iconForRepository } from './repository'
export { iconForStatus } from './status'
export { syncClockwise } from './sync-clockwise'
