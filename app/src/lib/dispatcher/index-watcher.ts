import { Repository } from '../../models/repository'
import { EventEmitter } from 'events'
import * as Path from 'path'
import * as Fs from 'fs'

/**
 * A component designed to monitor the repository filesystem for events
 * involving the index.lock file. These events are raised using EventEmitter
 * so the application can detect the presence of the lock file and prevent
 * the user from committing at this time.
 *
 * This work leverages knowledge from reading the source of `file-watcher`
 * (https://github.com/xpensia/file-watcher/) without requiring the full
 * API surface.
 */
export class IndexWatcher extends EventEmitter {
  private readonly gitDir: string

  private watcher: Fs.FSWatcher | null

  public constructor(repository: Repository) {
    super()

    this.gitDir = Path.join(repository.path, '.git')
  }

  public on(
    event: 'index-changed',
    listener: (isIndexLocked: boolean) => void
  ): this {
    return super.on(event, listener)
  }

  private onChanged = (isIndexLocked: boolean) => {
    this.emit('index-changed', isIndexLocked)
  }

  private onChange = (event: string, filename: string) => {
    const isValidPath = filename === 'index.lock'
    if (!isValidPath) {
      return
    }

    Fs.stat(Path.join(this.gitDir, filename), (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          this.onChanged(false)
        } else {
          log.warn('IndexWatcher encounted an unexpected error', err)
        }
        return
      }

      if (event === 'rename') {
        this.onChanged(true)
        return
      }

      log.warn(`IndexWatcher did not handle event '${event}'`)
    })
  }

  /**
   * Start monitoring the git directory for index.lock changes.
   *
   * Will error if the .git directory doesn't exist, or if the path provided
   * isn't a valid repository.
   */
  public start() {
    Fs.stat(this.gitDir, (err, stats) => {
      if (err) {
        throw err
      }

      if (!stats.isDirectory()) {
        throw new Error('IndexWatcher not configured to watch a directory')
      }

      this.watcher = Fs.watch(this.gitDir, this.onChange)
    })
  }

  /**
   * Stop the watcher and cleanup any internal resources.
   */
  public stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
