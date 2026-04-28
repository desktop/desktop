import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { Branch, BranchType } from '../../../src/models/branch'
import { Donut } from '../../../src/ui/donut'
import {
  renderBranchHasRemoteWarning,
  renderBranchNameExistsOnRemoteWarning,
} from '../../../src/ui/lib/branch-name-warnings'
import * as octicons from '../../../src/ui/octicons/octicons.generated'
import { Octicon } from '../../../src/ui/octicons/octicon'
import { createOcticonElement } from '../../../src/ui/octicons/octicon'
import { render, screen } from '../../helpers/ui/render'

function createBranch(
  name: string,
  upstream: string | null,
  type: BranchType,
  ref: string
) {
  return new Branch(name, upstream, { sha: 'abc123' }, type, ref)
}

describe('visual helper surfaces', () => {
  it('renders octicons and creates octicon wrapper elements', () => {
    const view = render(
      <Octicon symbol={octicons.alert} className="warning-mark" />
    )

    const svg = view.container.querySelector('svg.octicon.warning-mark')
    const wrapper = createOcticonElement(
      octicons.check,
      'wrapper-icon',
      'icon-id'
    )

    assert.notEqual(svg, null)
    assert.equal(svg?.getAttribute('aria-hidden'), 'true')
    assert.equal(wrapper.id, 'icon-id')
    assert.ok(wrapper.classList.contains('wrapper-icon'))
    assert.notEqual(wrapper.querySelector('svg.octicon'), null)
  })

  it('renders donut segments for non-zero values and preserves the aria label', () => {
    const valueMap = new Map<string, number>([
      ['failure', 2],
      ['success', 3],
      ['neutral', 0],
    ])

    const view = render(
      <Donut valueMap={valueMap} ariaLabel="CI status summary" />
    )

    const donut = view.container.querySelector('svg.donut')
    const paths = Array.from(view.container.querySelectorAll('path')).map(
      path => path.getAttribute('class')
    )

    assert.notEqual(donut, null)
    assert.equal(donut?.getAttribute('aria-label'), 'CI status summary')
    assert.deepEqual(paths, ['failure', 'success'])
  })

  it('renders remote-tracking and duplicate-name branch warnings when applicable', () => {
    const remoteTrackingBranch = createBranch(
      'main',
      'origin/main',
      BranchType.Local,
      'refs/heads/main'
    )
    const remoteBranch = createBranch(
      'origin/feature',
      null,
      BranchType.Remote,
      'refs/remotes/origin/feature'
    )

    const view = render(
      <>
        {renderBranchHasRemoteWarning(remoteTrackingBranch)}
        {renderBranchNameExistsOnRemoteWarning('feature', [remoteBranch])}
      </>
    )

    const warnings = Array.from(
      view.container.querySelectorAll('.warning-helper-text')
    )

    assert.equal(warnings.length, 2)
    assert.ok(view.container.textContent?.includes('This branch is tracking'))
    assert.ok(view.container.textContent?.includes('origin/main'))
    assert.ok(view.container.textContent?.includes('A branch named'))
    assert.ok(view.container.textContent?.includes('feature'))
  })

  it('returns no branch warning markup when warning conditions are absent', () => {
    const localBranch = createBranch(
      'topic',
      null,
      BranchType.Local,
      'refs/heads/topic'
    )
    const remoteBranch = createBranch(
      'origin/feature',
      null,
      BranchType.Remote,
      'refs/remotes/origin/feature'
    )

    const view = render(
      <>
        {renderBranchHasRemoteWarning(localBranch)}
        {renderBranchNameExistsOnRemoteWarning('other', [remoteBranch])}
      </>
    )

    assert.equal(view.container.textContent, '')
    assert.equal(screen.queryByText(/branch named/i), null)
  })
})
