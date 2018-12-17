import * as Fs from 'fs'
import { Emitter, Disposable } from 'event-kit'

interface ICurrentFileTailState {
  /** The current read position in the file. */
  readonly position: number

  /** The currently active watcher instance. */
  readonly watcher: Fs.FSWatcher
}

/** Tail a file and read changes as they happen. */
export class Tailer {
  public readonly path: string

  private readonly emitter = new Emitter()

  private state: ICurrentFileTailState | null = null

  /** Create a new instance for tailing the given file. */
  public constructor(path: string) {
    this.path = path
  }

  /**
   * Register a function to be called whenever new data is available to be read.
   * The function will be given a read stream which has been created to read the
   * new data.
   */
  public onDataAvailable(fn: (stream: Fs.ReadStream) => void): Disposable {
    return this.emitter.on('data', fn)
  }

  /**
   * Register a function to be called whenever an error is reported by the underlying
   * filesystem watcher.
   */
  public onError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('error', fn)
  }

  private handleError(error: Error) {
    this.state = null
    this.emitter.emit('error', error)
  }

  /**
   * Start tailing the file. This can only be called again after calling `stop`.
   */
  public start() {
    if (this.state) {
      throw new Error(
        `Cannot start an already started Tailer for "${this.path}"!`
      )
    }

    try {
      const watcher = Fs.watch(this.path, this.onWatchEvent)
      watcher.on('error', error => {
        this.handleError(error)
      })
      this.state = { watcher, position: 0 }
    } catch (error) {
      this.handleError(error)
    }
  }

  private onWatchEvent = (event: string) => {
    if (event !== 'change') {
      return
    }

    if (!this.state) {
      return
    }

    Fs.stat(this.path, (err, stats) => {
      if (err) {
        return
      }

      const state = this.state
      if (!state) {
        return
      }

      if (stats.size <= state.position) {
        return
      }

      this.state = { ...state, position: stats.size }

      this.readChunk(stats, state.position)
    })
  }

  private readChunk(stats: Fs.Stats, position: number) {
    const stream = Fs.createReadStream(this.path, {
      start: position,
      end: stats.size,
    })

    this.emitter.emit('data', stream)
  }

  /** Stop tailing the file. */
  public stop() {
    const state = this.state
    if (state) {
      state.watcher.close()
      this.state = null
    }
  }
}
