import { formatBytes } from '../../src/ui/lib/format-bytes'

describe('formatBytes', () => {
  it('rounds to specified precision', () => {
    expect(formatBytes(1024 + 512, 2)).toEqual('1.50 KiB')
    expect(formatBytes(1024 + 512 + 256, 3)).toEqual('1.750 KiB')

    // not fixed
    expect(formatBytes(1024 + 512, 2, false)).toEqual('1.5 KiB')
    expect(formatBytes(1024 + 512 + 256, 3, false)).toEqual('1.75 KiB')

    expect(formatBytes(1024 + 512, 0)).toEqual('2 KiB')
    expect(formatBytes(1024 + 512 + 256, 1)).toEqual('1.8 KiB')

    expect(formatBytes(1024 + 512 - 1, 0)).toEqual('1 KiB')
    expect(formatBytes(1024 + 512 + 256 - 1, 1)).toEqual('1.7 KiB')
  })
})
