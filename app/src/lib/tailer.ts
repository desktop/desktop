import * as Fs from 'node:fs'
import { Emitter, type Disposable } from 'event-kit'

interface ICurrentFileTailState {
  /** The current read position in the file. */
  position: number

  /** The currently active watcher instance. */
  readonly watcher: Fs.FSWatcher

  /** Whether a stat or read is in progress. */
  reading: boolean

  /** Whether a change arrived while a stat or read was in progress. */
  readPending: boolean

  /** The stream whose file descriptor must close before the next read. */
  stream: Fs.ReadStream | null
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
          state.readPending = true
          this.readNextChunk(state)
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

  private readNextChunk(state: ICurrentFileTailState) {
    if (this.state !== state || state.reading) {
      return
    }

    state.reading = true
    state.readPending = false

    Fs.stat(this.path, (err, stats) => {
      if (this.state !== state) {
        return
      }

      if (err) {
        this.handleError(err)
        return
      }

      if (stats.size <= state.position) {
        this.finishRead(state)
        return
      }

      this.readChunk(state, stats.size)
    })
  }

  private readChunk(state: ICurrentFileTailState, size: number) {
    const stream = Fs.createReadStream(this.path, {
      start: state.position,
      end: size - 1,
    })
    state.position = size
    state.stream = stream

    stream.on('error', error => {
      if (this.state === state) {
        this.handleError(error)
      }
    })
    stream.on('close', () => this.finishRead(state))
    this.emitter.emit('data', stream)
  }

  private finishRead(state: ICurrentFileTailState) {
    if (this.state !== state) {
      return
    }

    state.stream = null
    state.reading = false
    if (state.readPending) {
      this.readNextChunk(state)
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
