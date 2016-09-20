export class FrameDebouncer<T> {
  private value: T | null = null
  private scheduled: boolean
  private readonly callback: (value: T) => void

  public constructor(callback: (value: T) => void) {
    this.callback = callback
  }

  private _update = () => {
    this.callback(this.value!)
    this.value = null
    this.scheduled = false
  }

  public update(value: T) {
    this.value = value

    if (!this.scheduled) {
      requestAnimationFrame(this._update)
      this.scheduled = true
    }
  }
}
