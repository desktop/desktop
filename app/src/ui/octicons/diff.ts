import { OcticonSymbolVariant } from '.'

/**
 * An check mark produced by Gavin that is scaled for 12x12 as opposed to the
 * regular 16x16 and is thicker for better visibility.
 */
export const diffCheck: OcticonSymbolVariant = {
  w: 12,
  h: 12,
  p: [
    'M10.5303 2.96967C10.8232 3.26256 10.8232 3.73744 10.5303 4.03033L5.03033 9.53033C4.73744 9.82322 4.26256 9.82322 3.96967 9.53033L1.46967 7.03033C1.17678 6.73744 1.17678 6.26256 1.46967 5.96967C1.76256 5.67678 2.23744 5.67678 2.53033 5.96967L4.5 7.93934L9.46967 2.96967C9.76256 2.67678 10.2374 2.67678 10.5303 2.96967Z',
  ],
}

/**
 * An dash for the "mixed" state of the diff hunk handle check all produced by
 * Gavin that is scaled for 12x12 as opposed to the regular 16x16 and is thicker
 * for better visibility.
 */
export const diffDash: OcticonSymbolVariant = {
  w: 12,
  h: 12,
  p: [
    'm1.3125 6c0-.41421.33579-.75.75-.75h7.875c.4142 0 .75.33579.75.75s-.3358.75-.75.75h-7.875c-.41421 0-.75-.33579-.75-.75z',
  ],
}
