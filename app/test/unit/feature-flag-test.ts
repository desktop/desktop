import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import {
  enableCommitMessageGeneration,
  enableCopilotSdkCommitMessageGeneration,
} from '../../src/lib/feature-flag'
import { Account } from '../../src/models/account'

function makeAccount(
  features: ReadonlyArray<string>,
  isCopilotDesktopEnabled = true
): Account {
  return new Account(
    'monalisa',
    getDotComAPIEndpoint(),
    'token',
    [],
    '',
    1,
    'Mona Lisa',
    'free',
    undefined,
    isCopilotDesktopEnabled,
    features
  )
}

function withDevBuild<T>(callback: () => T): T {
  const testGlobal = globalThis as typeof globalThis & { __DEV__: boolean }
  const previousDev = testGlobal.__DEV__
  try {
    testGlobal.__DEV__ = true
    return callback()
  } finally {
    testGlobal.__DEV__ = previousDev
  }
}

describe('enableCopilotSdkCommitMessageGeneration', () => {
  it('enables the SDK path in dev builds for accounts that can generate commit messages', () => {
    const account = makeAccount(['desktop_copilot_generate_commit_message'])

    assert.equal(enableCommitMessageGeneration(account), true)
    assert.equal(
      withDevBuild(() => enableCopilotSdkCommitMessageGeneration(account)),
      true
    )
  })

  it('does not enable the SDK path in dev builds without commit message generation access', () => {
    const account = makeAccount([])

    assert.equal(enableCommitMessageGeneration(account), false)
    assert.equal(
      withDevBuild(() => enableCopilotSdkCommitMessageGeneration(account)),
      false
    )
  })
})
