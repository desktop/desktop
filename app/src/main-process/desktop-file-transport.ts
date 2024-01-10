import { createWriteStream, WriteStream } from 'fs'
import { join } from 'path'
import { MESSAGE } from 'triple-beam'
import TransportStream, { TransportStreamOptions } from 'winston-transport'
import { EOL } from 'os'
import { readdir, unlink } from 'fs/promises'
import { promisify } from 'util'
import escapeRegExp from 'lodash/escapeRegExp'

type DesktopFileTransportOptions = TransportStreamOptions & {
  readonly logDirectory: string
}

const MaxRetainedLogFiles = 14
const fileSuffix = `.desktop.${__RELEASE_CHANNEL__}.log`
const pathRe = new RegExp(
  '(\\d{4}-\\d{2}-\\d{2})' + escapeRegExp(fileSuffix) + '$'
)

const error = (operation: string) => (error: any) => {
  if (__DEV__) {
    console.error(`DesktopFileTransport: ${operation}`, error)
  }
  return undefined
}

/**
 * A re-implementation of the winston-daily-rotate-file module
 *
 * winston-daily-rotate-file depends on moment.js which we've unshipped
 * so we're using this instead.
 *
 * Please note that this is in no way a general purpose transport like
 * winston-daily-rotate-file, it's highly specific to the needs of GitHub
 * Desktop.
 */
export class DesktopFileTransport extends TransportStream {
  private stream?: WriteStream
  private logDirectory: string

  public constructor(opts: DesktopFileTransportOptions) {
    const { logDirectory, ...rest } = opts
    super(rest)
    this.logDirectory = logDirectory
  }

  public async log(info: any, callback: () => void) {
    const path = getFilePath(this.logDirectory)

    if (this.stream === undefined || this.stream.path !== path) {
      this.stream?.end()
      this.stream = createWriteStream(path, { flags: 'a' })
      this.stream.on('error', error('stream error'))

      await pruneDirectory(this.logDirectory).catch(error('prune'))
    }

    if (this.stream !== undefined) {
      await write(this.stream, `${info[MESSAGE]}${EOL}`).catch(error('write'))
      this.emit('logged', info)
    }

    callback?.()
  }

  public close(cb?: () => void) {
    this.stream?.end(cb)
    this.stream = undefined
  }
}

const write = promisify<WriteStream, string, void>((s, c, cb) => s.write(c, cb))
const getFilePrefix = (d = new Date()) => d.toISOString().split('T', 1)[0]
const getFilePath = (p: string) => join(p, `${getFilePrefix()}${fileSuffix}`)
const getLogFilesIn = (p: string) =>
  readdir(p, { withFileTypes: true })
    .then(entries => entries.filter(x => x.isFile() && pathRe.test(x.name)))
    .catch(error('readdir'))

const pruneDirectory = async (p: string) => {
  const all = await getLogFilesIn(p)

  if (all && all.length > MaxRetainedLogFiles) {
    const end = all.length - MaxRetainedLogFiles + 1
    const old = all.sort().slice(0, end)

    for (const f of old) {
      await unlink(join(p, f.name)).catch(error('unlink'))
    }
  }
}
