import { convertToFlatpakPath } from '../../../src/lib/helpers/linux'

describe('convertToFlatpakPath()', () => {
  if (__LINUX__) {
    it('converts /usr paths', () => {
      const path = '/usr/bin/subl'
      const expectedPath = '/var/run/host/usr/bin/subl'
      expect(convertToFlatpakPath(path)).toEqual(expectedPath)
    })

    it('preserves /opt paths', () => {
      const path = '/opt/slickedit-pro2018/bin/vs'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }

  if (__WIN32__) {
    it('returns same path', () => {
      const path = 'C:\\Windows\\System32\\Notepad.exe'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }

  if (__DARWIN__) {
    it('returns same path', () => {
      const path = '/usr/local/bin/code'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }
})
