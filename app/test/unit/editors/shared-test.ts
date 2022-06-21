import {
  CustomEditorRepoEntityPathValue,
  processEditorLaunchArgs,
} from '../../../src/lib/editors/shared'

describe('shared editor', () => {
  describe('processEditorLaunchArgs', () => {
    it('returns an empty array when arguments are empty', async () => {
      const args = await processEditorLaunchArgs('/home/test/dev', '')

      expect(args).toBeArrayOfSize(0)
    })

    it('returns an array with path to repo if the args are undefined', async () => {
      const args = await processEditorLaunchArgs('/home/test/dev', undefined)

      expect(args).toEqual(['/home/test/dev'])
    })

    it('returns an array with properly removed white spaces in the arguments', async () => {
      const args = await processEditorLaunchArgs(
        '/home/test/dev',
        `    --reuse-window    ${CustomEditorRepoEntityPathValue}`
      )

      expect(args).toEqual(['--reuse-window', '/home/test/dev'])
    })
  })
})
