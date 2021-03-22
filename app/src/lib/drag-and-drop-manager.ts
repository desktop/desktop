import { Disposable, Emitter } from 'event-kit'

/**
 * The drag and drop manager is implemented to manage drag and drop events
 * that we want to track app wide without updating the enter app state.
 *
 * This was specifically implemented due to reduced performance during drag and
 * drop when updating app state variables to track drag element changes during a
 * drag event.
 */
export class DragAndDropManager {
  private _isDragInProgress: boolean = false

  protected readonly emitter = new Emitter()

  public get isDragInProgress(): boolean {
    return this._isDragInProgress
  }

  public emitEnterDropTarget(targetDescription: string) {
    this.emitter.emit('enter-drop-target', targetDescription)
  }

  public emitLeaveDropTarget() {
    this.emitter.emit('leave-drop-target', {})
  }

  public onEnterDropTarget(
    fn: (targetDescription: string) => void
  ): Disposable {
    return this.emitter.on('enter-drop-target', fn)
  }

  public onLeaveDropTarget(fn: () => void): Disposable {
    return this.emitter.on('leave-drop-target', fn)
  }

  public dragStarted(): void {
    this._isDragInProgress = true
  }

  public dragEnded() {
    this._isDragInProgress = false
  }

  public emitEnterDragZone(dropZoneDescription: string) {
    this.emitter.emit('enter-drop-zone', dropZoneDescription)
  }

  public onEnterDragZone(
    fn: (dropZoneDescription: string) => void
  ): Disposable {
    return this.emitter.on('enter-drop-zone', fn)
  }
}

export const dragAndDropManager = new DragAndDropManager()
