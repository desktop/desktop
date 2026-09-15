import { describe, it } from 'node:test'
import assert from 'node:assert'
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
  it('creates a file on demand', async t => {
    const d = await createTempDirectory(t)
    const transport = new DesktopFileTransport({ logDirectory: d })

    assert.equal((await readdir(d)).length, 0)
    await info(transport, 'heyo')
    const files = await readdir(d)
    assert.equal(files.length, 1)
    assert.equal(await readFile(join(d, files[0]), 'utf8'), `heyo${EOL}`)

    await promisify(transport.close).call(transport)
  })

  it('creates a file for each day', async t => {
    t.mock.timers.enable({ apis: ['Date'] })

    const d = await createTempDirectory(t)
    const transport = new DesktopFileTransport({ logDirectory: d })

    assert.equal((await readdir(d)).length, 0)

    t.mock.timers.setTime(Date.parse('2022-03-10T10:00:00.000Z'))
    await info(transport, 'heyo')

    t.mock.timers.setTime(Date.parse('2022-03-11T11:00:00.000Z'))
    await info(transport, 'heyo')

    assert.equal((await readdir(d)).length, 2)

    await promisify(transport.close).call(transport)
  })

  it('retains a maximum of 14 log files', async t => {
    t.mock.timers.enable({ apis: ['Date'] })
    const d = await createTempDirectory(t)
    const transport = new DesktopFileTransport({ logDirectory: d })

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

    assert.equal((await readdir(d)).length, 0)
    for (const date of dates) {
      t.mock.timers.setTime(Date.parse(date))
      await info(transport, 'heyo')
    }

    const retainedFiles = await readdir(d)

    // Retains the newest files (ISO date is lexicographically sortable)
    assert.deepStrictEqual(retainedFiles.sort(), [
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

    await promisify(transport.close).call(transport)
  })
})
