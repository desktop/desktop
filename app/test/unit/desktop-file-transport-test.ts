import { readdir } from 'fs/promises'
import { LEVEL } from 'triple-beam'
import { DesktopFileTransport } from '../../src/main-process/desktop-file-transport'
import { createTempDirectory } from '../helpers/temp'

const info = (t: DesktopFileTransport, message: string) => {
  const chunk = { message, [LEVEL]: 'info', level: 'info' }
  return new Promise<void>((resolve, reject) =>
    t.write(chunk, e => (e ? reject(e) : resolve()))
  )
}

describe('DesktopFileTransport', () => {
  it('creates a file on demand', async () => {
    const d = await createTempDirectory('desktop-logs')
    const t = new DesktopFileTransport({ logDirectory: d })

    expect(await readdir(d)).toBeArrayOfSize(0)
    await info(t, 'heyo')
    expect(await readdir(d)).toBeArrayOfSize(1)

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

  it('cleans up files older than 14 days', async () => {
    const originalNow = Date.now
    const originalToISOString = Date.prototype.toISOString
    const globalDate = global.Date as any
    const d = await createTempDirectory('desktop-logs')
    const t = new DesktopFileTransport({ logDirectory: d })

    try {
      expect(await readdir(d)).toBeArrayOfSize(0)
      for (let i = 1; i < 20; i++) {
        const date = `${i}`.padStart(2, '0')
        globalDate.now = () => Date.parse(`2022-03-${date}T10:00:00.000Z`)
        globalDate.prototype.toISOString = () => `2022-03-${date}T10:00:00.000Z`
        await info(t, 'heyo')
      }

      expect(await readdir(d)).toBeArrayOfSize(14)

      t.close()
    } finally {
      globalDate.now = originalNow
      globalDate.prototype.toISOString = originalToISOString
    }
  })
})
