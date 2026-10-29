import { describe, it } from 'node:test'
import assert from 'node:assert'

import { createStateUpdate } from '../../src/ui/lib/section-filter-list'
import { IFilterListGroup } from '../../src/ui/lib/filter-list'

type Item = { readonly id: string; readonly text: ReadonlyArray<string> }
const item = (id: string): Item => ({ id, text: [id] })

type Options = { filterText?: string; selectedItem?: Item | null }

const props = (groups: ReadonlyArray<IFilterListGroup<Item>>, o: Options) => ({
  rowHeight: 20,
  groups,
  selectedItem: o.selectedItem ?? null,
  filterText: o.filterText,
  renderItem: () => null,
  renderGroupHeader: () => null,
  invalidationProps: null,
})

const update = (
  groups: ReadonlyArray<IFilterListGroup<Item>>,
  options: Options = {}
) => createStateUpdate<Item, string>(props(groups, options), null)

const describeRows = (state: ReturnType<typeof update>) =>
  state.rows.map(rows =>
    rows.map(r => (r.kind === 'item' ? r.item.id : `[${r.identifier}]`))
  )

describe('SectionFilterList createStateUpdate', () => {
  const groups: ReadonlyArray<IFilterListGroup<Item>> = [
    { identifier: 'a', items: [item('a1'), item('a2')], collapsed: true },
    { identifier: 'b', items: [item('b1')] },
  ]

  it('shows only the header of a collapsed group', () => {
    assert.deepEqual(describeRows(update(groups)), [['[a]'], ['[b]', 'b1']])
  })

  it('ignores collapsed while filtering', () => {
    assert.deepEqual(describeRows(update(groups, { filterText: 'a2' })), [
      ['[a]', 'a2'],
    ])
  })

  it('expands the collapsed group containing the selected item', () => {
    const state = update(groups, { selectedItem: item('a2') })
    assert.deepEqual(describeRows(state), [
      ['[a]', 'a1', 'a2'],
      ['[b]', 'b1'],
    ])
    assert.deepEqual(state.selectedRow, { section: 0, row: 2 })
  })

  it('marks groups held open by the selection or filter as not collapsible', () => {
    const canCollapse = (state: ReturnType<typeof update>) =>
      state.rows.map(rows => rows[0].kind === 'group' && rows[0].canCollapse)

    assert.deepEqual(canCollapse(update(groups)), [true, true])
    assert.deepEqual(
      canCollapse(update(groups, { selectedItem: item('b1') })),
      [true, false]
    )
    assert.deepEqual(canCollapse(update(groups, { filterText: '1' })), [
      false,
      false,
    ])
  })

  it('leaves groups without the flag unchanged', () => {
    const plain = groups.map(({ identifier, items }) => ({ identifier, items }))
    assert.deepEqual(describeRows(update(plain)), [
      ['[a]', 'a1', 'a2'],
      ['[b]', 'b1'],
    ])
  })

  it('keeps the selected header selected when groups are reordered', () => {
    const state = { ...update(groups), selectedRow: { section: 1, row: 0 } }
    const next = createStateUpdate<Item, string>(
      props([...groups].reverse(), {}),
      state
    )
    assert.deepEqual(next.selectedRow, { section: 0, row: 0 })
  })

  it('keeps a selected header selected across updates', () => {
    const state = { ...update(groups), selectedRow: { section: 1, row: 0 } }
    const next = createStateUpdate<Item, string>(
      props(groups, { selectedItem: item('a1') }),
      state
    )
    assert.deepEqual(next.selectedRow, { section: 1, row: 0 })
  })
})
