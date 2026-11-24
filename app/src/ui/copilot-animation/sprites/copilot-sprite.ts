/**
 * A Copilot sprite strip.
 *
 * Strips are 32 units wide and stack their 32x32 frames vertically. The
 * stylesheet for each sprite (see `app/styles/ui/_copilot-animation.scss`)
 * translates the strip upwards to step through its frames.
 */
export interface ICopilotSprite {
  /** Height of the strip in SVG user units (32 per frame). */
  readonly height: number

  /** SVG path data for the strip. */
  readonly paths: ReadonlyArray<string>
}
