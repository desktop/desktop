/**
 * The mouse scroller was built in conjunction with the drag functionality.
 * It purpose is to provide the ability to scroll a scrollable element when
 * the mouse gets close to the scrollable elements edge.
 *
 * Thus, it is built on the premise that we are providing it a scrollable
 * element and will continually provide it the mouse's position.
 * (which is tracked as part of drag event)
 *
 * Note: This implementation only accounts for vertical scrolling, but
 * horizontal scrolling would just be a matter of the same logic for left and
 * right bounds.
 */
class MouseScroller {
  private scrollTimer: number | undefined
  private defaultScrollEdge = 30

  /**
   * If provided element or a parent of that element is scrollable, it starts
   * scrolling based on the mouse's position.
   */
  public setupMouseScroll(element: Element, mouseY: number) {
    const scrollable = this.getClosestScrollElement(element)
    if (scrollable === null) {
      this.clearScrollTimer()
      return
    }

    this.updateMouseScroll(scrollable, mouseY)
  }

  /**
   * The scrolling action is wrapped in a continual time out, it will
   * continue to scroll until it reaches the end of the scroll area.
   */
  private updateMouseScroll(scrollable: Element, mouseY: number) {
    window.clearTimeout(this.scrollTimer)

    if (this.scrollVerticallyOnMouseNearEdge(scrollable, mouseY)) {
      this.scrollTimer = window.setTimeout(() => {
        this.updateMouseScroll(scrollable, mouseY)
      }, 30)
    }
  }

  /**
   * Cleat the scroller's timeout.
   */
  public clearScrollTimer() {
    window.clearTimeout(this.scrollTimer)
  }

  /**
   * Method to scroll elements based on the mouse position. If the user moves
   * their mouse near to the edge of the scrollable container, then, we want to
   * invoke the scroll.
   *
   * Returns false if mouse is not positioned near the edge of the scroll area
   * or the the scroll position is already at end of scroll area.
   */
  private scrollVerticallyOnMouseNearEdge(
    scrollable: Element,
    mouseY: number
  ): boolean {
    // how far away from the edge of container to invoke scroll
    const { top, bottom } = scrollable.getBoundingClientRect()
    const distanceFromBottom = bottom - mouseY
    const distanceFromTop = mouseY - top

    if (distanceFromBottom > 0 && distanceFromBottom < this.defaultScrollEdge) {
      return this.scrollDown(
        scrollable,
        this.defaultScrollEdge - distanceFromBottom
      )
    }

    if (distanceFromTop > 0 && distanceFromTop < this.defaultScrollEdge) {
      return this.scrollUp(scrollable, this.defaultScrollEdge - distanceFromTop)
    }

    return false
  }

  /**
   * Scrolls an element up by given scroll distance.
   * Returns false if already at top limit else true.
   */
  private scrollUp(scrollable: Element, scrollDistance: number): boolean {
    const limit = 0
    if (scrollable.scrollTop === limit) {
      return false
    }

    const inBounds = scrollable.scrollTop > scrollDistance
    const scrollTo = inBounds ? scrollable.scrollTop - scrollDistance : limit
    scrollable.scrollTo({ top: scrollTo })
    return true
  }

  /**
   * Scrolls an element up by given scroll distance.
   * Returns false if already at bottom limit else true.
   */
  private scrollDown(scrollable: Element, scrollDistance: number): boolean {
    const limit = scrollable.scrollHeight - scrollable.clientHeight
    if (scrollable.scrollTop === limit) {
      return false
    }

    const inBounds = scrollable.scrollTop + scrollDistance < limit
    const scrollTo = inBounds ? scrollable.scrollTop + scrollDistance : limit
    scrollable.scrollTo({ top: scrollTo })
    return true
  }

  /**
   * Method to determine if an element is scrollable if not finds the closest
   * parent that is scrollable or returns null.
   */
  private getClosestScrollElement(element: Element): Element | null {
    const { position: elemPosition } = getComputedStyle(element)

    if (elemPosition === 'fixed') {
      return null
    }

    if (this.isScrollable(element)) {
      return element
    }

    let parent: Element | null
    for (parent = element; (parent = parent.parentElement); ) {
      const { position: parentPosition } = getComputedStyle(parent)

      // exclude static parents
      if (elemPosition === 'absolute' && parentPosition === 'static') {
        continue
      }

      if (this.isScrollable(parent) && this.hasScrollableContent(parent)) {
        return parent
      }
    }

    return null
  }

  /**
   * Determines if element is scrollable based on elements styles.
   */
  private isScrollable(element: Element): boolean {
    const style = getComputedStyle(element)
    const overflowRegex = /(auto|scroll)/
    return overflowRegex.test(
      style.overflow + style.overflowY + style.overflowX
    )
  }

  /**
   * Determines if there is content overflow that could be handled by a
   * scrollbar
   */
  private hasScrollableContent(scrollable: Element): boolean {
    return scrollable.clientHeight < scrollable.scrollHeight
  }
}

export const mouseScroller = new MouseScroller()
