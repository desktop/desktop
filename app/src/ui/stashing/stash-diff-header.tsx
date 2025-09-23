import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'

interface IStashDiffHeaderProps {
  readonly stashEntry: IStashEntry
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly askForConfirmationOnDiscardStash: boolean
}

interface IStashDiffHeaderState {
  readonly isRestoring: boolean
  readonly isDiscarding: boolean
}

/**
 * Component to provide the actions that can be performed
 * on a stash while viewing a stash diff
 */
export class StashDiffHeader extends React.Component<
  IStashDiffHeaderProps,
  IStashDiffHeaderState
> {
  private _stashesCache: ReadonlyArray<IStashEntry> | null = null
  private _currentStashIndex: number = -1

  public constructor(props: IStashDiffHeaderProps) {
    super(props)

    this.state = {
      isRestoring: false,
      isDiscarding: false,
    }
  }

  public render() {
    const { isRestoring, isDiscarding } = this.state

    return (
      <div className="header">
        <h3>Stashed changes</h3>
        {this.renderStashPicker()}
        <div className="row">
          <OkCancelButtonGroup
            okButtonText="Restore"
            okButtonDisabled={isRestoring || isDiscarding}
            onOkButtonClick={this.onRestoreClick}
            cancelButtonText="Discard"
            cancelButtonDisabled={isRestoring || isDiscarding}
            onCancelButtonClick={this.onDiscardClick}
            okButtonAriaDescribedBy="restore-description"
          />
          <div className="explanatory-text" id="restore-description">
            <span className="text">
              <strong>Restore</strong> will move your stashed files to the
              Changes list.
            </span>
          </div>
        </div>
      </div>
    )
  }

  private renderStashPicker() {
    // fetch Desktop-created stashes for the current branch
    const stashes = this.props.dispatcher.getCurrentBranchDesktopStashEntries(
      this.props.repository
    )

    if (stashes.length <= 1) {
      return null
    }

    // Find index of currently displayed stash
    const currentSha = this.props.stashEntry.stashSha
    const currentIx = stashes.findIndex(s => s.stashSha === currentSha)
    const label = currentIx >= 0 ? `Stash ${currentIx}` : 'Stash'

    this._stashesCache = stashes
    this._currentStashIndex = currentIx

    return (
      <div className="row">
        <div className="stashes-picker">
          <span className="text">Viewing: {label}</span>
          <Button onClick={this.onStashNewerClick} disabled={currentIx <= 0}>
            Newer
          </Button>
          <Button onClick={this.onStashOlderClick} disabled={currentIx >= stashes.length - 1}>
            Older
          </Button>
        </div>
      </div>
    )
  }

  private onStashOlderClick = () => {
    const stashes = this._stashesCache
    const currentIx = this._currentStashIndex
    if (!stashes || currentIx < 0) {
      return
    }
    const nextIx = Math.min(currentIx + 1, stashes.length - 1)
    const next = stashes[nextIx]
    if (next) {
      this.props.dispatcher.selectDesktopStashEntry(
        this.props.repository,
        next.stashSha
      )
    }
  }

  private onStashNewerClick = () => {
    const stashes = this._stashesCache
    const currentIx = this._currentStashIndex
    if (!stashes || currentIx < 0) {
      return
    }
    const prevIx = Math.max(currentIx - 1, 0)
    const prev = stashes[prevIx]
    if (prev) {
      this.props.dispatcher.selectDesktopStashEntry(
        this.props.repository,
        prev.stashSha
      )
    }
  }

  private onDiscardClick = async () => {
    const {
      dispatcher,
      repository,
      stashEntry,
      askForConfirmationOnDiscardStash,
    } = this.props

    if (!askForConfirmationOnDiscardStash) {
      this.setState({
        isDiscarding: true,
      })

      try {
        await dispatcher.dropStash(repository, stashEntry)
      } finally {
        this.setState({
          isDiscarding: false,
        })
      }
    } else {
      dispatcher.showPopup({
        type: PopupType.ConfirmDiscardStash,
        stash: stashEntry,
        repository,
      })
    }
  }

  private onRestoreClick = async () => {
    const { dispatcher, repository, stashEntry } = this.props

    try {
      this.setState({ isRestoring: true })
      await dispatcher.popStash(repository, stashEntry)
    } catch (err) {
      const errorWithMetadata = new ErrorWithMetadata(err, {
        repository: repository,
      })
      dispatcher.postError(errorWithMetadata)
    } finally {
      this.setState({ isRestoring: false })
    }
  }
}
