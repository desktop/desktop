import { readdir, readFile } from 'fs/promises'
import { EOL } from 'os'
import { join } from 'path'
import { Writable } from 'stream'
import { LEVEL, MESSAGE } from 'triple-beam'
import { promisify } from 'util'
import { DesktopFileTransport } from '../../src/main-process/desktop-file-transport'
import { createTempDirectory } from '../helpers/temp'

const write = promisify<Writable, any, void>((t, c, cb) => t.write(c, cb))
const format = (msg: string, lvl: string) => ({ [MESSAGE]: msg, [LEVEL]: lvl })
const info = (t: DesktopFileTransport, m: string) => write(t, format(m, 'info'))

describe('DesktopFileTransport', () => {
  it('creates a file on demand', async () => {
    const d = await createTempDirectory('desktop-logs')
    const t = new DesktopFileTransport({ logDirectory: d })

    expect(await readdir(d)).toBeArrayOfSize(0)
    await info(t, 'heyo')
    const files = await readdir(d)
    expect(files).toBeArrayOfSize(1)
    expect(await readFile(join(d, files[0]), 'utf8')).toEqual(`heyo${EOL}`)

    t.close()
  })

  it('creates a file for each day', async () => {
    const originalToISOString = Date.prototype.toISOString
    const globalDate = global.Date as any
    const d = await createTempDirectory('desktop-logs')
    const t = new DesktopFileTransport({ logDirectory: d })

    try {
      expect(await readdir(d)).toBeArrayOfSize(0)

      globalDate.prototype.toISOString = () => '2022-03-10T10:00:00.000Z'
      await info(t, 'heyo')

      globalDate.prototype.toISOString = () => '2022-03-11T11:00:00.000Z'
      await info(t, 'heyo')

      expect(await readdir(d)).toBeArrayOfSize(2)

      t.close()
    } finally {
      globalDate.toISOString = originalToISOString
    }
  })

  it.only('retains a maximum of 14 log files', async () => {
    const originalToISOString = Date.prototype.toISOString
    const globalDate = global.Date as any
    const d = await createTempDirectory('desktop-logs')
    const t = new DesktopFileTransport({ logDirectory: d })

    const dates = [
      '2022-03-01T10:00:00.000Z',
      '2022-03-02T10:00:00.000Z',
      '2022-03-03T10:00:00.000Z',
      '2022-03-04T10:00:00.000Z',
      '2022-03-05T10:00:00.000Z',
      '2022-03-06T10:00:00.000Z',
      '2022-03-07T10:00:00.000Z',
      '2022-03-08T10:00:00.000Z',
      '2022-03-09T10:00:00.000Z',
      '2022-03-10T10:00:00.000Z',
      '2022-03-11T10:00:00.000Z',
      '2022-03-12T10:00:00.000Z',
      '2022-03-13T10:00:00.000Z',
      '2022-03-14T10:00:00.000Z',
      '2022-03-15T10:00:00.000Z',
      '2022-03-16T10:00:00.000Z',
      '2022-03-17T10:00:00.000Z',
      '2022-03-18T10:00:00.000Z',
      '2022-03-19T10:00:00.000Z',
      '2022-03-20T10:00:00.000Z',
    ]

    try {
      expect(await readdir(d)).toBeArrayOfSize(0)
      for (const date of dates) {
        globalDate.prototype.toISOString = () => date
        await info(t, 'heyo')
      }

      const retainedFiles = await readdir(d)
      expect(retainedFiles).toBeArrayOfSize(14)

      // Retains the newest files (ISO date is lexicographically sortable)
      expect(retainedFiles.sort()).toEqual([
        '2022-03-07.desktop.development.log',
        '2022-03-08.desktop.development.log',
        '2022-03-09.desktop.development.log',
        '2022-03-10.desktop.development.log',
        '2022-03-11.desktop.development.log',
        '2022-03-12.desktop.development.log',
        '2022-03-13.desktop.development.log',
        '2022-03-14.desktop.development.log',
        '2022-03-15.desktop.development.log',
        '2022-03-16.desktop.development.log',
        '2022-03-17.desktop.development.log',
        '2022-03-18.desktop.development.log',
        '2022-03-19.desktop.development.log',
        '2022-03-20.desktop.development.log',
      ])

      t.close()
    } finally {
      globalDate.prototype.toISOString = originalToISOString
    }
  })
})
