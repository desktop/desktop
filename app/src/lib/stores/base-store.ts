import { Emitter, Disposable } from 'event-kit'

export abstract class BaseStore {
  protected readonly emitter = new Emitter()

  protected emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  protected emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /**
   * Register an event handler which will be invoked whenever
   * an unexpected error occurs during the sign-in process. Note
   * that some error are handled in the flow and passed along in
   * the sign in state for inline presentation to the user.
   */
  public onDidError(fn: (e: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }
}

export class TypedBaseStore<T> {
  protected readonly emitter = new Emitter()

  protected emitUpdate(data: T) {
    this.emitter.emit('did-update', data)
  }

  protected emitError(error: Error) {
    this.emitter.emit('did-error', error)
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: (data: T) => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /**
   * Register an event handler which will be invoked whenever
   * an unexpected error occurs during the sign-in process. Note
   * that some error are handled in the flow and passed along in
   * the sign in state for inline presentation to the user.
   */
  public onDidError(fn: (e: Error) => void): Disposable {
    return this.emitter.on('did-error', fn)
  }
}
