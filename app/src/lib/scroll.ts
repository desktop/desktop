const default_scroll_edge = 30

/**
 * Method to scroll elements with scrollbars during a drag event. If the user
 * moves their mouse near to the edge of the scrollable container, then, we
 * want to invoke the scroll so they can access other parts of the scroll area
 * without stopping their drag.
 *
 * Note: This implementation only accounts for vertical scrolling, but
 * horizontal scrolling would just be a matter of the same logic for left and
 * right bounds.
 *
 * @param scrollable - The element to adjust the scroll position of
 * @param mouseY - where the mouse y coordinate position is
 */
export function scrollVertically(scrollable: Element, mouseY: number): boolean {
  const { top, bottom } = scrollable.getBoundingClientRect()
  console.log('top: ', top, ' bottom: ', bottom, ' mouseY: ', mouseY)
  const distanceFromBottom = bottom - mouseY
  const distanceFromTop = mouseY - top
  // how far away from the edge of container to invoke scroll
  const edge = default_scroll_edge

  console.log('distanceFromBottom: ', distanceFromBottom)
  if (distanceFromBottom > 0 && distanceFromBottom < edge) {
    return scrollDown(scrollable, edge - distanceFromBottom)
  }

  if (distanceFromTop > 0 && distanceFromTop < edge) {
    return scrollUp(scrollable, edge - distanceFromTop)
  }

  return false
}

function scrollUp(scrollable: Element, scrollDistance: number): boolean {
  const limit = 0
  if (scrollable.scrollTop === limit) {
    return false
  }

  console.log('Scroll Up')
  const inBounds = scrollable.scrollTop > scrollDistance
  const scrollTo = inBounds ? scrollable.scrollTop - scrollDistance : limit
  scrollable.scroll({ top: scrollTo, behavior: 'smooth' })
  return true
}

function scrollDown(scrollable: Element, scrollDistance: number): boolean {
  const limit = scrollable.scrollHeight - scrollable.clientHeight
  console.log('ScrollDownLimit: ', limit, scrollable.scrollTop)
  console.log('scrollDistance: ', scrollDistance)
  if (scrollable.scrollTop === limit) {
    return false
  }

  const inBounds = scrollable.scrollTop + scrollDistance < limit
  const scrollTo = inBounds ? scrollable.scrollTop + scrollDistance : limit
  scrollable.scroll({ top: scrollTo, behavior: 'smooth' })
  return true
}

// https://stackoverflow.com/questions/35939886/find-first-scrollable-parent
export function getScrollParent(element: Element): Element | null {
  let style = getComputedStyle(element)
  const excludeStaticParent = style.position === 'absolute'
  const overflowRegex = /(auto|scroll)/

  if (style.position === 'fixed') {
    return null
  }

  for (
    let parent: Element | null = element;
    (parent = parent.parentElement);

  ) {
    style = getComputedStyle(parent)
    if (excludeStaticParent && style.position === 'static') {
      continue
    }
    if (
      overflowRegex.test(style.overflow + style.overflowY + style.overflowX)
    ) {
      return parent
    }
  }

  return null
}

export function hasScrollableContent(scrollable: Element): boolean {
  return scrollable.clientHeight < scrollable.scrollHeight
}
