import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import { TutorialStep } from '../../../src/models/tutorial-step'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { TutorialDone } from '../../../src/ui/tutorial/done'
import { TutorialStepInstructions } from '../../../src/ui/tutorial/tutorial-step-instruction'
import { TutorialWelcome } from '../../../src/ui/tutorial/welcome'
import { render, screen } from '../../helpers/ui/render'

class TestDispatcher {
  public exploreRepositories = new Array<Repository>()
  public shownPopups = new Array<PopupType>()

  public showGitHubExplore(repository: Repository) {
    this.exploreRepositories.push(repository)
  }

  public showPopup(popup: { type: PopupType }) {
    this.shownPopups.push(popup.type)
  }
}

function toDispatcher(dispatcher: TestDispatcher): Dispatcher {
  return dispatcher as unknown as Dispatcher
}

function createRepository() {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    owner,
    42,
    false,
    'https://github.com/octocat/desktop'
  )

  return new Repository('/tmp/tutorial-fixture', 5, gitHubRepository, false)
}

describe('tutorial welcome surfaces', () => {
  it('renders the tutorial welcome definitions and images', () => {
    const view = render(<TutorialWelcome />)
    const definitions = Array.from(view.container.querySelectorAll('li'))
    const images = Array.from(view.container.querySelectorAll('img')).map(
      image => image.getAttribute('alt')
    )

    assert.ok(screen.getByText('Welcome to GitHub Desktop'))
    assert.ok(
      screen.getByText(
        'Use this tutorial to get comfortable with Git, GitHub, and GitHub Desktop.'
      )
    )
    assert.equal(definitions.length, 3)
    assert.deepEqual(images, [
      'Html syntax icon',
      'People with discussion bubbles overhead',
      'Server stack with cloud',
    ])
  })

  it('renders tutorial step instructions with step state, skip content, and toggle callbacks', () => {
    const openedSections = new Array<TutorialStep>()

    function isComplete(step: TutorialStep) {
      return step === TutorialStep.PickEditor
    }

    function isNextStepTodo(step: TutorialStep) {
      return step === TutorialStep.CreateBranch
    }

    function onSummaryClick(step: TutorialStep) {
      openedSections.push(step)
    }

    const view = render(
      <TutorialStepInstructions
        summaryText="Create a branch"
        isComplete={isComplete}
        sectionId={TutorialStep.CreateBranch}
        isNextStepTodo={isNextStepTodo}
        currentlyOpenSectionId={TutorialStep.CreateBranch}
        skipLinkButton={<button type="button">Skip</button>}
        onSummaryClick={onSummaryClick}
      >
        <p>Create a branch to isolate your work.</p>
      </TutorialStepInstructions>
    )

    const details = view.container.querySelector('details')
    const blueCircle = view.container.querySelector('.blue-circle')

    assert.notEqual(details, null)
    assert.equal(details?.getAttribute('open'), '')
    assert.equal(blueCircle?.textContent, '2')
    assert.ok(screen.getByText('Create a branch'))
    assert.ok(screen.getByRole('button', { name: 'Skip' }))
    assert.ok(screen.getByText('Create a branch to isolate your work.'))

    openedSections.length = 0

    const toggleEvent = new window.Event('toggle', { bubbles: true })
    Object.defineProperty(toggleEvent, 'newState', {
      configurable: true,
      value: 'open',
    })
    details?.dispatchEvent(toggleEvent)

    assert.ok(openedSections.length >= 1)
    assert.ok(openedSections.every(step => step === TutorialStep.CreateBranch))

    view.rerender(
      <TutorialStepInstructions
        summaryText="Pick your editor"
        isComplete={isComplete}
        sectionId={TutorialStep.PickEditor}
        isNextStepTodo={isNextStepTodo}
        currentlyOpenSectionId={TutorialStep.CreateBranch}
        onSummaryClick={onSummaryClick}
      >
        <p>Pick an editor.</p>
      </TutorialStepInstructions>
    )

    assert.notEqual(view.container.querySelector('.green-circle svg'), null)
  })

  it('focuses tutorial completion once and routes suggested actions through the dispatcher', () => {
    const dispatcher = new TestDispatcher()
    const repository = createRepository()
    let announcements = 0

    function onTutorialCompletionAnnounced() {
      announcements++
    }

    render(
      <TutorialDone
        dispatcher={toDispatcher(dispatcher)}
        repository={repository}
        tutorialCompletionAnnounced={false}
        onTutorialCompletionAnnounced={onTutorialCompletionAnnounced}
      />
    )

    const heading = screen.getByRole('heading', { name: "You're done!" })
    const openExploreLabel = __DARWIN__ ? 'Open in Browser' : 'Open in browser'
    const createRepositoryLabel = __DARWIN__
      ? 'Create Repository'
      : 'Create repository'
    const addRepositoryLabel = __DARWIN__ ? 'Add Repository' : 'Add repository'

    assert.equal(document.activeElement, heading)
    assert.equal(announcements, 1)
    assert.ok(screen.getByRole('img', { name: 'Hands clapping' }))

    screen.getByRole('button', { name: openExploreLabel }).click()
    screen.getByRole('button', { name: createRepositoryLabel }).click()
    screen.getByRole('button', { name: addRepositoryLabel }).click()

    assert.deepEqual(dispatcher.exploreRepositories, [repository])
    assert.deepEqual(dispatcher.shownPopups, [
      PopupType.CreateRepository,
      PopupType.AddRepository,
    ])
  })
})
