import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { IIssueHit, IssuesStore } from '../../../src/lib/stores/issues-store'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { IssuesAutocompletionProvider } from '../../../src/ui/autocompletion/issues-autocompletion-provider'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { TestIssuesDatabase } from '../../helpers/databases/test-issues-database'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

/** Matches the Tooltip component's DefaultTooltipDelay */
const TooltipDelay = 400

const issue: IIssueHit = {
  number: 8119,
  title:
    'When referencing issue # in commit summary, show the full issue title in a tooltip',
}

/**
 * The provider only ever calls `refreshIssues` on the dispatcher, and only
 * from `getAutocompletionItems`, which these tests don't exercise.
 */
class TestDispatcher {
  public async refreshIssues() {}
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function createProvider() {
  const owner = new Owner('desktop', 'https://api.github.com', 1)
  const repository = new GitHubRepository('desktop', owner, 99)

  return new IssuesAutocompletionProvider(
    new IssuesStore(new TestIssuesDatabase()),
    repository,
    toDispatcher(new TestDispatcher())
  )
}

/**
 * JSDOM reports a scrollWidth and clientWidth of zero for every element, so
 * the Tooltip's overflow detection has to be stubbed out to exercise the
 * `onlyWhenOverflowed` behaviour.
 */
function stubOverflow(
  element: Element,
  scrollWidth: number,
  clientWidth: number
) {
  Object.defineProperty(element, 'scrollWidth', {
    value: scrollWidth,
    configurable: true,
  })
  Object.defineProperty(element, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  })
}

function renderIssueItem() {
  const view = render(createProvider().renderItem(issue))
  const title = view.container.querySelector('.title')

  if (title === null) {
    throw new Error('Expected the issue title to be rendered')
  }

  return { view, title }
}

function hover(element: Element) {
  fireEvent.mouseEnter(element, { clientX: 20, clientY: 20 })
  fireEvent.mouseMove(element, { clientX: 20, clientY: 20 })
  advanceTimersBy(TooltipDelay)
}

describe('IssuesAutocompletionProvider', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('renders the issue number and title', () => {
    const { view, title } = renderIssueItem()

    assert.equal(view.container.querySelector('.number')?.textContent, '#8119')
    assert.equal(title.textContent, issue.title)
  })

  it('exposes the issue number and full title as the item aria label', () => {
    assert.equal(
      createProvider().getItemAriaLabel(issue),
      `#8119 ${issue.title}`
    )
  })

  it('shows a tooltip with the full title when the title is truncated', () => {
    const { title } = renderIssueItem()

    stubOverflow(title, 400, 100)
    hover(title)

    assert.notEqual(
      screen.queryByText(issue.title, { selector: '.tooltip-content' }),
      null
    )
  })

  it('does not show a tooltip when the title fits', () => {
    const { title } = renderIssueItem()

    stubOverflow(title, 100, 100)
    hover(title)

    assert.equal(
      screen.queryByText(issue.title, { selector: '.tooltip-content' }),
      null
    )
  })
})
