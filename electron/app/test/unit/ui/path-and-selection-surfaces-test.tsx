import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  AppFileStatusKind,
  type AppFileStatus,
} from '../../../src/models/status'
import { MultipleSelection } from '../../../src/ui/changes/multiple-selection'
import { PathLabel } from '../../../src/ui/lib/path-label'
import { render } from '../../helpers/ui/render'

describe('path and selection surfaces', () => {
  it('renders a simple path label for non-rename statuses', () => {
    const status: AppFileStatus = { kind: AppFileStatusKind.Modified }
    const view = render(
      <PathLabel
        path="src/ui/branch.tsx"
        status={status}
        availableWidth={320}
        ariaHidden={true}
      />
    )

    const label = view.container.querySelector('.path-label-component')
    const pathText = view.container.querySelector('.path-text-component')

    assert.notEqual(label, null)
    assert.equal(label?.getAttribute('aria-hidden'), 'true')
    assert.notEqual(pathText, null)
    assert.ok(
      view.container.textContent?.includes(__WIN32__ ? 'src\\ui\\' : 'src/ui/')
    )
    assert.ok(view.container.textContent?.includes('branch.tsx'))
    assert.equal(view.container.querySelector('.rename-arrow'), null)
  })

  it('renders old and new paths for renamed files with a rename arrow', () => {
    const status: AppFileStatus = {
      kind: AppFileStatusKind.Renamed,
      oldPath: 'src/ui/old-name.tsx',
      renameIncludesModifications: false,
    }

    const view = render(
      <PathLabel
        path="src/ui/new-name.tsx"
        status={status}
        availableWidth={420}
      />
    )

    const labels = Array.from(
      view.container.querySelectorAll('.path-text-component')
    )
    const renameArrow = view.container.querySelector('.rename-arrow.octicon')

    assert.equal(labels.length, 2)
    assert.notEqual(renameArrow, null)
    assert.ok(view.container.textContent?.includes('old-name.tsx'))
    assert.ok(view.container.textContent?.includes('new-name.tsx'))
  })

  it('renders the multiple-selection blank slate with the selected file count', () => {
    const view = render(<MultipleSelection count={3} />)

    const panel = view.container.querySelector('#no-changes.panel.blankslate')
    const image = view.container.querySelector('.blankslate-image')

    assert.notEqual(panel, null)
    assert.notEqual(image, null)
    assert.equal(image?.getAttribute('alt'), '')
    assert.ok(view.container.textContent?.includes('3 files selected'))
  })
})
