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
    it(`returns an env containing PATH (${label})`, async () => {
      const result = await getShellEnv(undefined, shellKind, getPrintenvzPath())

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
