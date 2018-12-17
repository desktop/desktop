/** A utility class which allows for throttling arbitrary functions */
export class ThrottledScheduler {
  private delay: number
  private timeoutId: number | null = null

  /**
   * Initialize a new instance of the ThrottledScheduler class
   *
   * @param delay The minimum interval between invocations
   *                  of callbacks.
   */
  public constructor(delay: number) {
    this.delay = delay
  }

  /**
   * Queues a function to be invoked at the end of the timeout
   * window specified by the {delay} class parameter as long
   * as no other functions are queued.
   */
  public queue(func: Function) {
    this.clear()
    this.timeoutId = window.setTimeout(func, this.delay)
  }

  /** Resets the scheduler and unschedules queued callback (if any) */
  public clear() {
    if (this.timeoutId != null) {
      window.clearTimeout(this.timeoutId)
    }
  }
}
