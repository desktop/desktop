import { createWriteStream, WriteStream } from 'fs'
import { join } from 'path'
import { MESSAGE } from 'triple-beam'
import TransportStream, { TransportStreamOptions } from 'winston-transport'
import { EOL } from 'os'
import { readdir, unlink } from 'fs/promises'
import { escapeRegExp } from '../lib/helpers/regex'
import { offsetFromNow } from '../lib/offset-from'
import { omit } from 'lodash'

type DesktopFileTransportOptions = TransportStreamOptions & {
  readonly logDirectory: string
}

const fileSuffix = `.desktop.${__RELEASE_CHANNEL__}.log`
const pathRe = new RegExp(
  '(\\d{4}-\\d{2}-\\d{2})' + escapeRegExp(fileSuffix) + '$'
)

const debug = (...args: any) => {
  if (__DEV__) {
    console.error('DesktopFileTransport', ...args)
  }
  return undefined
}

/**
 * A re-implementation of the winston-daily-rotate-file module
 *
 * winston-daily-rotate-file depends on moment.js which we're trying to unship
 * so we're using this instead.
 *
 * Please note that this is in no way a general purpose transpot like
 * winston-daily-rotate-file, it's highly specific to the needs of GitHub
 * Desktop.
 */
export class DesktopFileTransport extends TransportStream {
  private stream?: WriteStream
  private logDirectory: string

  public constructor(opts: DesktopFileTransportOptions) {
    super(omit(opts, 'logDirectory'))
    this.logDirectory = opts.logDirectory
  }

  public async log(info: any, callback: () => void) {
    const path = getFilePath(this.logDirectory)

    if (this.stream === undefined || this.stream.path !== path) {
      this.stream?.end()
      this.stream = createWriteStream(path, { flags: 'a' })
      this.stream.on('error', debug)

      await pruneDirectory(this.logDirectory).catch(debug)
    }

    if (this.stream !== undefined) {
      await write(this.stream, `${info[MESSAGE]}${EOL}`).catch(debug)
      this.emit('logged', info)
    }

    callback?.()
  }

  public close(cb?: () => void) {
    this.stream?.end(cb)
    this.stream = undefined
  }
}
const write = (s: WriteStream, chunk: string) =>
  new Promise((resolve, reject) => {
    const draining: boolean = s.write(chunk, e =>
      e ? reject(e) : resolve(draining)
    )
  })

const getFilePrefix = (d = new Date()) => d.toISOString().split('T', 1)[0]
const getFilePath = (p: string) => join(p, `${getFilePrefix()}${fileSuffix}`)

const pruneDirectory = async (p: string) => {
  const treshold = offsetFromNow(-14, 'days')
  const files = await readdir(p).catch(debug)

  for (const f of files ?? []) {
    const m = pathRe.exec(f)
    const d = m ? Date.parse(m[1]) : NaN

    if (!isNaN(d) && d < treshold) {
      await unlink(join(p, f)).catch(e =>
        console.debug(`DesktopFileTransport: Error removing old log file`, e)
      )
    }
  }
}
