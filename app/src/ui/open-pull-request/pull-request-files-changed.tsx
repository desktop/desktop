import * as React from 'react'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { Dispatcher } from '../dispatcher'
import { openFile } from '../lib/open-file'

interface IPullRequestFilesChangedProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The file whose diff should be displayed. */
  readonly selectedFile: CommittedFileChange | null

  /** The diff that should be rendered */
  readonly diff: IDiff | null

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Whether we should hide whitespace in diff. */
  readonly hideWhitespaceInDiff: boolean
}

/**
 * A component for viewing the file diff for a pull request.
 */
export class PullRequestFilesChanged extends React.Component<
  IPullRequestFilesChangedProps,
  {}
> {
  /**
   * Opens a binary file in an the system-assigned application for
   * said file type.
   */
  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  /** Called when the user changes the hide whitespace in diffs setting. */
  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    const { selectedFile } = this.props
    return this.props.dispatcher.onHideWhitespaceInHistoryDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository,
      selectedFile as CommittedFileChange
    )
  }

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderDiff() {
    const { diff, selectedFile } = this.props

    if (diff === null || selectedFile === null) {
      return
    }

    const {
      repository,
      imageDiffType,
      hideWhitespaceInDiff,
      showSideBySideDiff,
    } = this.props

    return (
      <SeamlessDiffSwitcher
        repository={repository}
        imageDiffType={imageDiffType}
        file={selectedFile}
        diff={diff}
        readOnly={true}
        hideWhitespaceInDiff={hideWhitespaceInDiff}
        showSideBySideDiff={showSideBySideDiff}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
      />
    )
  }

  public render() {
    // TODO: handle empty change set
    return <div className="pull-request-diff-viewer">{this.renderDiff()}</div>
  }
}
