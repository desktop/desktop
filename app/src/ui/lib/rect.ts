/**
 * Returns a value indicating whether the two supplied client
 * rect instances are structurally equal (i.e. all their individual
 * values are equal).
 */
export function rectEquals(x: ClientRect, y: ClientRect) {
  if (x === y) {
    return true
  }

  return (
    x.left === y.left &&
    x.right === y.right &&
    x.top === y.top &&
    x.bottom === y.bottom &&
    x.width === y.width &&
    x.height === y.height
  )
}
