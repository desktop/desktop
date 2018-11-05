import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Ref } from '../lib/ref'

interface IPushBranchCommitsProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly onConfirm: (repository: Repository, branch: Branch) => void
  readonly onDismissed: () => void

  /**
   * Used to show the number of commits a branch is ahead by.
   * If this value is undefined, component defaults to publish view.
   */
  readonly unPushedCommits?: number
}

interface IPushBranchCommitsState {
  /**
   * A value indicating whether we're currently working on publishing
   * or pushing the branch to the remote. This value is used to tell
   * the dialog to apply the loading and disabled state which adds a
   * spinner and disables form controls for the duration of the operation.
   */
  readonly isPushingOrPublishing: boolean
}

/**
 * Returns a string used for communicating the number of commits
 * that will be pushed to the user.
 *
 * @param numberOfCommits The number of commits that will be pushed
 * @param unit            A string written in such a way that without
 *                        modification it can be paired with the digit 1
 *                        such as 'commit' and which, when a 's' is appended
 *                        to it can be paired with a zero digit or a number
 *                        greater than one.
 */
function pluralize(numberOfCommits: number, unit: string) {
  return numberOfCommits === 1
    ? `${numberOfCommits} ${unit}`
    : `${numberOfCommits} ${unit}s`
}

/**
 * Simple type guard which allows us to substitute the non-obvious
 * this.props.unPushedCommits === undefined checks with
 * renderPublishView(this.props.unPushedCommits).
 */
function renderPublishView(
  unPushedCommits: number | undefined
): unPushedCommits is undefined {
  return unPushedCommits === undefined
}

/**
 * This component gets shown if the user attempts to open a PR with
 * a) An un-published branch
 * b) A branch that is ahead of its base branch
 *
 * In both cases, this asks the user if they'd like to push/publish the branch.
 * If they confirm we push/publish then open the PR page on dotcom.
 */
export class PushBranchCommits extends React.Component<
  IPushBranchCommitsProps,
  IPushBranchCommitsState
> {
  private dialogButtonRef: HTMLButtonElement | null = null
  public constructor(props: IPushBranchCommitsProps) {
    super(props)

    this.state = { isPushingOrPublishing: false }
  }

  public componentDidMount() {
    if (this.dialogButtonRef) {
      this.dialogButtonRef.focus() // Focuses on the Publish Branch button when the push-branch-commits dialog opens
    }
  }

  public render() {
    return (
      <Dialog
        id="push-branch-commits"
        key="push-branch-commits"
        title={this.renderDialogTitle()}
        onDismissed={this.cancel}
        onSubmit={this.cancel}
        loading={this.state.isPushingOrPublishing}
        disabled={this.state.isPushingOrPublishing}
      >
        {this.renderDialogContent()}

        <DialogFooter>{this.renderButtonGroup()}</DialogFooter>
      </Dialog>
    )
  }

  private onDialogOpenRef = (element: HTMLButtonElement | null) => {
    this.dialogButtonRef = element
  }

  private renderDialogContent() {
    if (renderPublishView(this.props.unPushedCommits)) {
      return (
        <DialogContent>
          <p>Your branch must be published before opening a pull request.</p>
          <p>
            Would you like to publish <Ref>{this.props.branch.name}</Ref> now
            and open a pull request?
          </p>
        </DialogContent>
      )
    }

    const localCommits = pluralize(this.props.unPushedCommits, 'local commit')

    return (
      <DialogContent>
        <p>
          You have {localCommits} that haven't been pushed to the remote yet.
        </p>
        <p>
          Would you like to push your changes to{" "}
          <Ref>{this.props.branch.name}</Ref> before creating your pull request?
        </p>
      </DialogContent>
    )
  }

  private renderDialogTitle() {
    if (renderPublishView(this.props.unPushedCommits)) {
      return __DARWIN__ ? 'Publish Branch?' : 'Publish branch?'
    }

    return __DARWIN__ ? `Push Local Changes?` : `Push local changes?`
  }

  private renderButtonGroup() {
    if (renderPublishView(this.props.unPushedCommits)) {
      return (
        <ButtonGroup>
          <Button
            type="submit"
            onClick={this.onPushOrPublishButtonClick}
            onButtonRef={this.onDialogOpenRef}
          >
            {__DARWIN__ ? 'Publish Branch' : 'Publish branch'}
          </Button>
          <Button onClick={this.cancel}>Cancel</Button>
        </ButtonGroup>
      )
    }

    return (
      <ButtonGroup>
        <Button type="submit" onClick={this.onPushOrPublishButtonClick}>
          {__DARWIN__ ? 'Push Commits' : 'Push commits'}
        </Button>
        <Button onClick={this.onCreateWithoutPushButtonClick}>
          {__DARWIN__ ? 'Create Without Pushing' : 'Create without pushing'}
        </Button>
      </ButtonGroup>
    )
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  private onCreateWithoutPushButtonClick = () => {
    this.props.onConfirm(this.props.repository, this.props.branch)
    this.props.onDismissed()
  }

  private onPushOrPublishButtonClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault()

    const { repository, branch } = this.props

    this.setState({ isPushingOrPublishing: true })

    try {
      await this.props.dispatcher.push(repository)
    } finally {
      this.setState({ isPushingOrPublishing: false })
    }

    this.props.onConfirm(repository, branch)
    this.props.onDismissed()
  }
}
