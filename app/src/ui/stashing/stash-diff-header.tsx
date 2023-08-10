import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { PopupType } from '../../models/popup'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
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
