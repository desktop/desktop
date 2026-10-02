import assert from 'node:assert'
import { afterEach, it } from 'node:test'
import * as React from 'react'
import { Preferences } from '../../../src/ui/preferences/preferences'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { setAuthoringMode } from '../../../src/lib/git/account-authorship'

afterEach(() => localStorage.clear())

it('synchronizes external-app authors for all tracked repositories even with no current repository', async () => {
  setAuthoringMode('desktop')
  const calls: string[] = []
  const dispatcher = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (..._args: ReadonlyArray<unknown>) => {
          calls.push(String(property))
          return Promise.resolve()
        },
    }
  ) as Dispatcher
  const preferences = new Preferences({
    dispatcher,
    accounts: [],
    repository: null,
    onDismissed: () => {},
  } as unknown as React.ComponentProps<typeof Preferences>)

  await preferences['onSave']()

  assert.ok(calls.includes('synchronizeExternalAppAuthors'))
  assert.strictEqual(
    calls.filter(x => x === 'synchronizeExternalAppAuthors').length,
    1
  )
})
