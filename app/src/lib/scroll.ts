const default_scroll_edge = 30

/**
 * Method to scroll elements based on mouse position. If the user moves their
 * mouse near to the edge of the scrollable container, then, we want to invoke
 * the scroll.
 *
 * Returns false if mouse is not positioned near the edge of the scroll area or
 * the the scroll position is already at end of scroll area.
 *
 * Note: This implementation only accounts for vertical scrolling, but
 * horizontal scrolling would just be a matter of the same logic for left and
 * right bounds.
 *
 * @param scrollable - The element to adjust the scroll position of
 * @param mouseY - where the mouse y coordinate position is
 */
export function scrollVerticallyOnMouseNearEdge(
  scrollable: Element,
  mouseY: number
): boolean {
  // how far away from the edge of container to invoke scroll
  const edge = default_scroll_edge
  const { top, bottom } = scrollable.getBoundingClientRect()
  const distanceFromBottom = bottom - mouseY
  const distanceFromTop = mouseY - top

  if (distanceFromBottom > 0 && distanceFromBottom < edge) {
    return scrollDown(scrollable, edge - distanceFromBottom)
  }

  if (distanceFromTop > 0 && distanceFromTop < edge) {
    return scrollUp(scrollable, edge - distanceFromTop)
  }

  return false
}

/**
 * Scrolls an element up by given scroll distance.
 * Returns false if already at top limit else true.
 */
function scrollUp(scrollable: Element, scrollDistance: number): boolean {
  const limit = 0
  if (scrollable.scrollTop === limit) {
    return false
  }

  const inBounds = scrollable.scrollTop > scrollDistance
  const scrollTo = inBounds ? scrollable.scrollTop - scrollDistance : limit
  scrollable.scroll({ top: scrollTo, behavior: 'smooth' })
  return true
}

/**
 * Scrolls an element up by given scroll distance.
 * Returns false if already at bottom limit else true.
 */
function scrollDown(scrollable: Element, scrollDistance: number): boolean {
  const limit = scrollable.scrollHeight - scrollable.clientHeight
  if (scrollable.scrollTop === limit) {
    return false
  }

  const inBounds = scrollable.scrollTop + scrollDistance < limit
  const scrollTo = inBounds ? scrollable.scrollTop + scrollDistance : limit
  scrollable.scroll({ top: scrollTo, behavior: 'smooth' })
  return true
}

/**
 * Method to determine if an element is scrollable if not finds the closest
 * parent that is scrollable or returns null.
 */
export function getClosestScrollElement(element: Element): Element | null {
  const { position: elemPosition } = getComputedStyle(element)

  if (elemPosition === 'fixed') {
    return null
  }

  if (isScrollable(element)) {
    return element
  }

  let parent: Element | null
  for (parent = element; (parent = parent.parentElement); ) {
    const { position: parentPosition } = getComputedStyle(parent)

    // exclude static parents
    if (elemPosition === 'absolute' && parentPosition === 'static') {
      continue
    }

    if (isScrollable(parent) && hasScrollableContent(parent)) {
      return parent
    }
  }

  return null
}

function isScrollable(element: Element): boolean {
  const style = getComputedStyle(element)
  const overflowRegex = /(auto|scroll)/
  return overflowRegex.test(style.overflow + style.overflowY + style.overflowX)
}

function hasScrollableContent(scrollable: Element): boolean {
  return scrollable.clientHeight < scrollable.scrollHeight
}
