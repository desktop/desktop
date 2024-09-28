import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import {
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import { Dialog, DialogContent } from '../dialog'
import { ICommitContext } from '../../models/commit'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { IAutocompletionProvider } from '../autocompletion'
import { Author, UnknownAuthor } from '../../models/author'
import { CommitMessage } from '../changes/commit-message'
import noop from 'lodash/noop'
import { Popup } from '../../models/popup'
import { Foldout } from '../../lib/app-state'
import { Account } from '../../models/account'
import { RepoRulesInfo } from '../../models/repo-rules'
import { IAheadBehind } from '../../models/branch'

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
  readonly coAuthors: ReadonlyArray<Author>

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

  readonly showCommitLengthWarning: boolean

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

  /** Repository rules that apply to the branch. */
  readonly repoRulesInfo: RepoRulesInfo

  readonly aheadBehind: IAheadBehind | null

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

  readonly repositoryAccount: Account | null
  readonly accounts: ReadonlyArray<Account>
}

interface ICommitMessageDialogState {
  readonly showCoAuthoredBy: boolean
  readonly coAuthors: ReadonlyArray<Author>
}

export class CommitMessageDialog extends React.Component<
  ICommitMessageDialogProps,
  ICommitMessageDialogState
> {
  public constructor(props: ICommitMessageDialogProps) {
    super(props)
    const { showCoAuthoredBy, coAuthors } = props
    this.state = { showCoAuthoredBy, coAuthors }
  }

  public render() {
    return (
      <Dialog
        id="commit-message-dialog"
        title={this.props.dialogTitle}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <CommitMessage
            showInputLabels={true}
            branch={this.props.branch}
            mostRecentLocalCommit={null}
            commitAuthor={this.props.commitAuthor}
            dispatcher={this.props.dispatcher}
            isShowingModal={true}
            isShowingFoldout={false}
            commitButtonText={this.props.dialogButtonText}
            commitToAmend={null}
            repository={this.props.repository}
            commitMessage={this.props.commitMessage}
            focusCommitMessage={false}
            autocompletionProviders={this.props.autocompletionProviders}
            showCoAuthoredBy={this.state.showCoAuthoredBy}
            coAuthors={this.state.coAuthors}
            placeholder={''}
            prepopulateCommitSummary={this.props.prepopulateCommitSummary}
            key={this.props.repository.id}
            showBranchProtected={this.props.showBranchProtected}
            repoRulesInfo={this.props.repoRulesInfo}
            aheadBehind={this.props.aheadBehind}
            showNoWriteAccess={this.props.showNoWriteAccess}
            commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
            showCommitLengthWarning={this.props.showCommitLengthWarning}
            onCoAuthorsUpdated={this.onCoAuthorsUpdated}
            onShowCoAuthoredByChanged={this.onShowCoAuthorsChanged}
            onConfirmCommitWithUnknownCoAuthors={
              this.onConfirmCommitWithUnknownCoAuthors
            }
            onCreateCommit={this.props.onSubmitCommitMessage}
            anyFilesAvailable={true}
            anyFilesSelected={true}
            onCommitMessageFocusSet={noop}
            onRefreshAuthor={this.onRefreshAuthor}
            onShowPopup={this.onShowPopup}
            onShowFoldout={this.onShowFoldout}
            onCommitSpellcheckEnabledChanged={
              this.onCommitSpellcheckEnabledChanged
            }
            repositoryAccount={this.props.repositoryAccount}
            onStopAmending={this.onStopAmending}
            onShowCreateForkDialog={this.onShowCreateForkDialog}
            accounts={this.props.accounts}
          />
        </DialogContent>
      </Dialog>
    )
  }

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<Author>) =>
    this.setState({ coAuthors })

  private onShowCoAuthorsChanged = (showCoAuthoredBy: boolean) =>
    this.setState({ showCoAuthoredBy })

  private onConfirmCommitWithUnknownCoAuthors = (
    coAuthors: ReadonlyArray<UnknownAuthor>,
    onCommitAnyway: () => void
  ) => {
    const { dispatcher } = this.props
    dispatcher.showUnknownAuthorsCommitWarning(coAuthors, onCommitAnyway)
  }

  private onRefreshAuthor = () =>
    this.props.dispatcher.refreshAuthor(this.props.repository)

  private onShowPopup = (p: Popup) => this.props.dispatcher.showPopup(p)
  private onShowFoldout = (f: Foldout) => this.props.dispatcher.showFoldout(f)

  private onCommitSpellcheckEnabledChanged = (enabled: boolean) =>
    this.props.dispatcher.setCommitSpellcheckEnabled(enabled)

  private onStopAmending = () =>
    this.props.dispatcher.stopAmendingRepository(this.props.repository)

  private onShowCreateForkDialog = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      this.props.dispatcher.showCreateForkDialog(this.props.repository)
    }
  }
}
