import { Disposable, Emitter } from 'event-kit'
import { DragData, DragType } from '../models/drag-drop'

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
  private _dragData: DragData | null = null

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

  public setDragData(dragData: DragData | null): void {
    this._dragData = dragData
  }

  public get dragData(): DragData | null {
    return this._dragData
  }

  public isDragOfTypeInProgress(type: DragType) {
    return this._isDragInProgress && this.isDragOfType(type)
  }

  public isDragOfType(type: DragType) {
    return this._dragData !== null && this._dragData.type === type
  }
}

export const dragAndDropManager = new DragAndDropManager()
