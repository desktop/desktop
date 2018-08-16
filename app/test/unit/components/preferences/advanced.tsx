/* tslint:disable:react-this-binding-issue */

import * as React from 'react'
import { expect } from 'chai'

import { render, cleanup, fireEvent } from 'react-testing-library'

import { Default as DefaultShell } from '../../../../src/lib/shells'

import { Advanced } from '../../../../src/ui/preferences/advanced'
import { ExternalEditor } from '../../../../src/lib/editors'

const defaultClickArgs = {
  bubbles: true, // click events must bubble for React to see it
  cancelable: true,
}

describe('<Advanced />', () => {
  afterEach(cleanup)

  it.only(`fires callback when checking repository removal`, () => {
    const defaultShell = DefaultShell
    const nullCallback = () => {}

    const editors: Array<ExternalEditor> = []

    let wasChecked = false
    const callback = (checked: boolean) => {
      wasChecked = checked
    }

    const { getByLabelText } = render(
      <Advanced
        optOutOfUsageTracking={false}
        confirmRepositoryRemoval={false}
        confirmDiscardChanges={false}
        availableEditors={editors}
        selectedExternalEditor={undefined}
        availableShells={[]}
        selectedShell={defaultShell}
        onOptOutofReportingchanged={nullCallback}
        onConfirmDiscardChangesChanged={nullCallback}
        onConfirmRepositoryRemovalChanged={callback}
        onMergeToolCommandChanged={nullCallback}
        onMergeToolNameChanged={nullCallback}
        onSelectedEditorChanged={nullCallback}
        onSelectedShellChanged={nullCallback}
        mergeTool={null}
      />
    )

    const confirmation = getByLabelText(
      'Show confirmation dialog before removing repositories'
    ) as HTMLInputElement

    expect(confirmation).is.not.null

    fireEvent(confirmation, new MouseEvent('click', defaultClickArgs))

    expect(wasChecked).is.true
  })
})
