import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getShellEnv } from '../../src/lib/hooks/get-shell-env'
import { SupportedHooksEnvShell } from '../../src/lib/hooks/config'
import { getPrintenvzPath } from 'printenvz'

describe('getShellEnv', () => {
  const shellKinds: ReadonlyArray<SupportedHooksEnvShell | undefined> =
    __WIN32__ ? ['git-bash', 'pwsh', 'powershell', 'cmd'] : [undefined]

  for (const shellKind of shellKinds) {
    const label = shellKind ?? 'default shell'
    it(`returns an env containing PATH (${label})`, async t => {
      const result = await getShellEnv(undefined, shellKind, getPrintenvzPath())

      // 'pwsh' might not be found on modern windows machines.
      //  'powershell' should be used instead
      if (shellKind === 'pwsh' && result.kind === 'failure') {
        t.skip(`'pwsh' is not installed on this system`)
        return
      }

      assert.equal(result.kind, 'success')

      if (result.kind !== 'success') {
        return
      }

      const pathKey = Object.keys(result.env).find(
        k => k.toLowerCase() === 'path'
      )

      assert.notEqual(
        pathKey,
        undefined,
        `Expected env to contain a PATH key but got keys: ${Object.keys(
          result.env
        ).join(', ')}`
      )
    })
  }
})
