import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent } from '../dialog'
import { ICommitContext } from '../../models/commit'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { IAutocompletionProvider } from '../autocompletion'
import { IAuthor } from '../../models/author'
import { CommitMessage } from '../changes/commit-message'

interface ICommitMessageDialogProps {
  /**
   * A list of autocompletion providers that should be enabled for this input.
   */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /**
   * The branch that will be modified by the commit
   */
  readonly branch: string | null

  /**
   * A list of authors (name, email pairs) which have been entered into the
   * co-authors input box in the commit form and which _may_ be used in the
   * subsequent commit to add Co-Authored-By commit message trailers depending
   * on whether the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /**
   * The name and email that will be used for the author info when committing
   * barring any race where user.name/user.email is updated between us reading
   * it and a commit being made (ie we don't currently use this value explicitly
   * when committing)
   */
  readonly commitAuthor: CommitIdentity | null

  /** The commit message for a work-in-progress commit. */
  readonly commitMessage: ICommitMessage | null

  /**
   * Whether or not the app should use spell check on commit summary and description
   */
  readonly commitSpellcheckEnabled: boolean

  /** Text for the ok button */
  readonly dialogButtonText: string

  /** The title to be displayed in the dialog */
  readonly dialogTitle: string

  /** The application dispatcher */
  readonly dispatcher: Dispatcher

  /** Whether to prepopulate the commit summary with the placeholder or summary*/
  readonly prepopulateCommitSummary: boolean

  /** The current repository to commit against. */
  readonly repository: Repository

  /** Whether to warn the user that they are on a protected branch. */
  readonly showBranchProtected: boolean

  /**
   * Whether or not to show a field for adding co-authors to a commit
   * (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /** Whether to warn the user that they don't have write access */
  readonly showNoWriteAccess: boolean

  /** Method to run when dialog is dismissed */
  readonly onDismissed: () => void

  /** Method to run when dialog is submitted */
  readonly onSubmitCommitMessage: (context: ICommitContext) => Promise<boolean>
}

export class CommitMessageDialog extends React.Component<
  ICommitMessageDialogProps,
  {}
> {
  public render() {
    return (
      <Dialog
        id="commit-message"
        title={this.props.dialogTitle}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <CommitMessage
            branch={this.props.branch}
            commitAuthor={this.props.commitAuthor}
            commitButtonText={this.props.dialogButtonText}
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            commitMessage={this.props.commitMessage}
            focusCommitMessage={false}
            autocompletionProviders={this.props.autocompletionProviders}
            showCoAuthoredBy={this.props.showCoAuthoredBy}
            coAuthors={this.props.coAuthors}
            placeholder={''}
            prepopulateCommitSummary={this.props.prepopulateCommitSummary}
            key={this.props.repository.id}
            showBranchProtected={this.props.showBranchProtected}
            showNoWriteAccess={this.props.showNoWriteAccess}
            commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
            onCreateCommit={this.props.onSubmitCommitMessage}
          />
        </DialogContent>
      </Dialog>
    )
  }
}
