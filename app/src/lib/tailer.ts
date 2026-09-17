import * as Fs from 'node:fs'
import { Emitter, type Disposable } from 'event-kit'

interface ICurrentFileTailState {
  /** The current read position in the file. */
  readonly position: number

  /** The watcher identifying the current tailing lifetime. */
  readonly watcher: Fs.FSWatcher

  /** Whether a stat or read is in progress. */
  readonly reading: boolean

  /** Whether a change arrived while a stat or read was in progress. */
  readonly readPending: boolean

  /** The stream whose file descriptor must close before the next read. */
  readonly stream: Fs.ReadStream | null
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
   * new data. The stream must be consumed for tailing to continue.
   */
  public onDataAvailable(fn: (stream: Fs.ReadStream) => void): Disposable {
    return this.emitter.on('data', fn)
  }

  /**
   * Register a function to be called whenever an error is reported by the
   * filesystem watcher or while reading the file.
   */
  public onError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('error', fn)
  }

  private handleError(error: Error) {
    this.stop()
    this.emitter.emit('error', error)
  }

  /**
   * Start tailing the file. This can only be called again after calling `stop`.
   */
  public start() {
    if (this.state) {
      throw new Error(`Tailer already running`)
    }

    try {
      const watcher = Fs.watch(this.path, event => {
        const state = this.state
        if (state?.watcher === watcher && event === 'change') {
          this.state = { ...state, readPending: true }
          this.readNextChunk(watcher)
        }
      })
      watcher.on('error', error => {
        if (this.state?.watcher === watcher) {
          this.handleError(error)
        }
      })
      this.state = {
        watcher,
        position: 0,
        reading: false,
        readPending: false,
        stream: null,
      }
    } catch (error) {
      this.handleError(error)
    }
  }

  private readNextChunk(watcher: Fs.FSWatcher) {
    const state = this.state
    if (state?.watcher !== watcher || state.reading) {
      return
    }

    this.state = { ...state, reading: true, readPending: false }

    Fs.stat(this.path, (err, stats) => {
      const currentState = this.state
      if (currentState?.watcher !== watcher) {
        return
      }

      if (err) {
        this.handleError(err)
        return
      }

      if (stats.size <= currentState.position) {
        this.finishRead(watcher)
        return
      }

      this.readChunk(currentState, stats.size)
    })
  }

  private readChunk(state: ICurrentFileTailState, size: number) {
    const stream = Fs.createReadStream(this.path, {
      start: state.position,
      end: size - 1,
    })
    this.state = { ...state, position: size, stream }

    stream.on('error', error => {
      if (this.state?.stream === stream) {
        this.handleError(error)
      }
    })
    stream.on('close', () => {
      if (this.state?.stream === stream) {
        this.finishRead(state.watcher)
      }
    })
    this.emitter.emit('data', stream)
  }

  private finishRead(watcher: Fs.FSWatcher) {
    const state = this.state
    if (state?.watcher !== watcher) {
      return
    }

    this.state = { ...state, stream: null, reading: false }
    if (state.readPending) {
      this.readNextChunk(watcher)
    }
  }

  /** Stop tailing the file and destroy any active read stream. */
  public stop() {
    const state = this.state
    this.state = null
    if (state) {
      state.watcher.close()
      state.stream?.destroy()
    }
  }
}
