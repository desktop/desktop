import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getInheritedHookEnv } from '../../src/lib/hooks/inherited-hook-env'

describe('getInheritedHookEnv', () => {
  const override = "'core.hooksPath=C:/Temp/desktop-git-hooks-123'"

  it('preserves the Git child environment and removes only proxy settings', () => {
    const original = {
      Path: 'C:/Windows/System32;C:/Program Files/Git/cmd',
      CUSTOM_HOOK_VARIABLE: 'keep me',
      GIT_EXEC_PATH: 'C:/Desktop/git/libexec/git-core',
      GIT_ASKPASS: 'askpass',
      GIT_SSH_COMMAND: 'ssh-wrapper',
      DESKTOP_TRAMPOLINE_TOKEN: 'credential-token',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'test.value',
      GIT_CONFIG_VALUE_0: 'configured',
      PROCESS_PROXY_PORT: '12345',
      PROCESS_PROXY_TOKEN: 'proxy-token',
      GIT_CONFIG_PARAMETERS:
        "'core.hooksPath=.githooks' " +
        override +
        " 'credential.helper=' 'credential.helper=desktop' 'test.value=kept'",
    }
    const result = getInheritedHookEnv(original, override)
    assert.equal(
      result.GIT_CONFIG_PARAMETERS,
      "'core.hooksPath=.githooks'  'credential.helper=' 'credential.helper=desktop' 'test.value=kept'"
    )
    for (const [key, value] of Object.entries(original)) {
      if (
        key !== 'GIT_CONFIG_PARAMETERS' &&
        !key.startsWith('PROCESS_PROXY_')
      ) {
        assert.equal(result[key], value)
      }
    }
    assert.equal(result.PROCESS_PROXY_PORT, undefined)
    assert.equal(result.PROCESS_PROXY_TOKEN, undefined)
    assert.equal(original.PROCESS_PROXY_TOKEN, 'proxy-token')
    assert.ok(original.GIT_CONFIG_PARAMETERS.includes(override))
  })

  it('does not add Git configuration when none was inherited', () => {
    assert.deepEqual(getInheritedHookEnv({ PATH: '/usr/bin' }, override), {
      PATH: '/usr/bin',
    })
  })

  it('preserves similarly named hook paths', () => {
    const config = "'core.hooksPath=C:/Temp/desktop-git-hooks-123-other'"
    assert.equal(
      getInheritedHookEnv({ GIT_CONFIG_PARAMETERS: config }, override)
        .GIT_CONFIG_PARAMETERS,
      config
    )
  })
})
