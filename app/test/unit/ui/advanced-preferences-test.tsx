import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Advanced } from '../../../src/ui/preferences/advanced'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function defaults() {
  return {
    useWindowsOpenSSH: false,
    optOutOfUsageTracking: false,
    useExternalCredentialHelper: false,
    repositoryIndicatorsEnabled: true,
    automaticallyUseSystemGitForOAuthAppAccessRestrictions: false,
    onUseWindowsOpenSSHChanged: () => {},
    onOptOutofReportingChanged: () => {},
    onUseExternalCredentialHelperChanged: () => {},
    onRepositoryIndicatorsEnabledChanged: () => {},
    onAutomaticallyUseSystemGitForOAuthAppAccessRestrictionsChanged: () => {},
  }
}

describe('AdvancedPreferences', () => {
  it('lets the user enable automatic system Git fallback for OAuth App access restrictions', () => {
    const values = new Array<boolean>()
    render(
      <Advanced
        {...defaults()}
        onAutomaticallyUseSystemGitForOAuthAppAccessRestrictionsChanged={value =>
          values.push(value)
        }
      />
    )

    const checkbox = screen.getByLabelText(
      'Automatically use system Git when GitHub Desktop is blocked'
    )

    fireEvent.click(checkbox)

    assert.deepStrictEqual(values, [true])
    assert.ok(
      screen.getByText(
        /Desktop will still show follow-up errors, merge conflicts, and stash options in the GUI/
      )
    )
  })
})
