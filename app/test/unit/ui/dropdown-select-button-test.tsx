import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import assert from 'node:assert'
import { it } from 'node:test'
import * as React from 'react'
import { DropdownSelectButton } from '../../../src/ui/dropdown-select-button'
import { MergeCallToActionWithConflicts } from '../../../src/ui/history/merge-call-to-action-with-conflicts'
import { Branch, BranchType } from '../../../src/models/branch'
import { Repository } from '../../../src/models/repository'
import { ComputedAction } from '../../../src/models/computed-action'
import { createMockDispatcher } from '../../helpers/mock-dispatcher'

function getOptions() {
  return [
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
    { id: 'third', label: 'Third' },
  ]
}

function highlightSecond() {
  const dropdown = screen.getByRole('button', { name: 'Choose option' })
  fireEvent.keyDown(dropdown, { key: 'ArrowDown' })
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
}

it('preserves the highlighted merge operation when History preview finishes loading', async () => {
  const merges = new Array<boolean | undefined>()
  const dispatcher = createMockDispatcher({
    initializeMultiCommitOperation: () => {},
    incrementMetric: async () => {},
    mergeBranch: async (_repository, _branch, _status, isSquash) => {
      merges.push(isSquash)
    },
    executeCompare: async () => {},
    updateCompareForm: () => {},
  })
  const props: React.ComponentProps<typeof MergeCallToActionWithConflicts> = {
    repository: new Repository('/unused-history-fixture', 123, null, false),
    dispatcher,
    mergeStatus: { kind: ComputedAction.Loading },
    currentBranch: new Branch(
      'main',
      null,
      { sha: '1111111' },
      BranchType.Local,
      'refs/heads/main'
    ),
    comparisonBranch: new Branch(
      'topic',
      null,
      { sha: '2222222' },
      BranchType.Local,
      'refs/heads/topic'
    ),
    commitsBehind: 2,
  }
  const view = render(<MergeCallToActionWithConflicts {...props} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Merge options' }), {
    key: 'ArrowDown',
  })
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
  assert.ok(
    screen
      .getByRole('menuitemradio', { name: /Squash and merge/ })
      .classList.contains('selected')
  )

  view.rerender(
    <MergeCallToActionWithConflicts
      {...props}
      mergeStatus={{ kind: ComputedAction.Clean }}
    />
  )
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })
  const primary = view.container.querySelector('.invoke-button')
  assert.ok(primary instanceof HTMLButtonElement)
  fireEvent.click(primary)
  await waitFor(() => assert.deepStrictEqual(merges, [true]))
})

it('preserves a highlighted option by id across fresh option arrays', () => {
  const selected = new Array<string>()
  const props = {
    options: getOptions(),
    checkedOption: 'first',
    dropdownAriaLabel: 'Choose option',
    onCheckedOptionChange: (option: { readonly id: string }) =>
      selected.push(option.id),
  }
  const view = render(<DropdownSelectButton {...props} />)
  highlightSecond()
  view.rerender(<DropdownSelectButton {...props} options={getOptions()} />)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })
  assert.deepStrictEqual(selected, ['second'])
})

it('resets the highlight when its option is removed', () => {
  const selected = new Array<string>()
  const props = {
    options: getOptions(),
    checkedOption: 'first',
    dropdownAriaLabel: 'Choose option',
    onCheckedOptionChange: (option: { readonly id: string }) =>
      selected.push(option.id),
  }
  const view = render(<DropdownSelectButton {...props} />)
  highlightSecond()
  view.rerender(
    <DropdownSelectButton
      {...props}
      options={getOptions().filter(option => option.id !== 'second')}
    />
  )
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })
  assert.deepStrictEqual(selected, ['first'])
})

it('resets the highlight when the controlled checked value changes', () => {
  const selected = new Array<string>()
  const props = {
    options: getOptions(),
    checkedOption: 'first',
    dropdownAriaLabel: 'Choose option',
    onCheckedOptionChange: (option: { readonly id: string }) =>
      selected.push(option.id),
  }
  const view = render(<DropdownSelectButton {...props} />)
  highlightSecond()
  view.rerender(
    <DropdownSelectButton
      {...props}
      options={getOptions()}
      checkedOption="third"
    />
  )
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' })
  assert.deepStrictEqual(selected, ['third'])
})
