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

/**
 * Returns true if `y` is entirely contained within `x`
 */
export function rectContains(x: ClientRect, y: ClientRect) {
  if (x === y) {
    return true
  }

  return (
    y.top >= x.top &&
    y.left >= x.left &&
    y.bottom <= x.bottom &&
    y.right <= x.right
  )
}

export const offsetRect = (rect: DOMRect, x: number, y: number) =>
  new DOMRect(rect.x + x, rect.y + y, rect.width, rect.height)
