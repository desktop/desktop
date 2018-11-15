import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Monospaced } from '../lib/monospaced'
import { PathText } from '../lib/path-text'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { ITrailer } from '../../lib/git/interpret-trailers'

const GitLFSWebsiteURL =
  'https://help.github.com/articles/versioning-large-files/'

interface IOversizedFilesProps {
  readonly oversizedFiles: ReadonlyArray<string>
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
  readonly commitSummary: string
  readonly commitDescription: string | null
  readonly repository: Repository
  readonly trailers?: ReadonlyArray<ITrailer>
}

/** A dialog to display a list of files that are too large to commit. */
export class OversizedFiles extends React.Component<IOversizedFilesProps> {
  private closeButton: Button | null = null

  public constructor(props: IOversizedFilesProps) {
    super(props)
  }

  private onCloseButtonRef = (button: Button | null) => {
    this.closeButton = button
  }

  public componentDidMount() {
    // Since focus is given to the Git LFS link by default, we will instead set focus onto the cancel button.
    if (this.closeButton != null) {
      this.closeButton.focus()
    }
  }

  public render() {
    return (
      <Dialog
        id="oversized-files"
        title={__DARWIN__ ? 'Files Too Large' : 'Files too large'}
        onDismissed={this.props.onDismissed}
        type="warning"
      >
        <DialogContent>
          <p>
            The following files are over 100MB.{' '}
            <strong>
              If you commit these files, you will no longer be able to push this
              repository to GitHub.com.
            </strong>
          </p>
          {this.renderFileList()}
          <p className="recommendation">
            We recommend you avoid committing these files or use{' '}
            <LinkButton uri={GitLFSWebsiteURL}>Git LFS</LinkButton> to store
            large files on GitHub.
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit" ref={this.onCloseButtonRef}>
              Cancel
            </Button>
            <Button onClick={this.commitAnyway}>
              {__DARWIN__ ? 'Commit Anyway' : 'Commit anyway'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderFileList() {
    return (
      <div className="files-list">
        {this.props.oversizedFiles.map(fileName => (
          <ul key={fileName}>
            <Monospaced>
              <PathText path={fileName} />
            </Monospaced>
          </ul>
        ))}
      </div>
    )
  }

  private commitAnyway = async () => {
    this.props.dispatcher.commitIncludedChanges(
      this.props.repository,
      this.props.commitSummary,
      this.props.commitDescription,
      this.props.trailers
    )

    await this.props.dispatcher.closePopup()
  }
}
