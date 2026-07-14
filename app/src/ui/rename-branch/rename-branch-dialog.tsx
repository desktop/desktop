import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { renderBranchHasRemoteWarning } from '../lib/branch-name-warnings'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { IAPIRepoRuleset } from '../../lib/api'
import { Account } from '../../models/account'
import {
  IBranchRuleError,
  checkBranchNameRules,
  renderBranchNameRuleError,
} from '../lib/branch-name-rule-validation'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly repository: Repository
  readonly branch: Branch
  readonly accounts: ReadonlyArray<Account>
  readonly cachedRepoRulesets: ReadonlyMap<number, IAPIRepoRuleset>
}

interface IRenameBranchState {
  readonly newName: string
  readonly currentError: IBranchRuleError | null
}

export class RenameBranch extends React.Component<
  IRenameBranchProps,
  IRenameBranchState
> {
  private branchRulesDebounceId: number | null = null

  private readonly ERRORS_ID = 'rename-branch-name-errors'

  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name, currentError: null }
  }

  public componentDidMount() {
    // Validate the pre-filled branch name on dialog open so existing
    // rule violations are shown immediately.
    if (this.state.newName !== '') {
      this.checkBranchRules(this.state.newName)
    }
  }

  public componentWillUnmount() {
    if (this.branchRulesDebounceId !== null) {
      window.clearTimeout(this.branchRulesDebounceId)
    }
  }

  public render() {
    const disabled =
      this.state.newName.length === 0 ||
      (!!this.state.currentError && !this.state.currentError.isWarning)
    const hasError = !!this.state.currentError

    return (
      <Dialog
        id="rename-branch"
        title={__DARWIN__ ? 'Rename Branch' : 'Rename branch'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.renameBranch}
        focusCloseButtonOnOpen={true}
      >
        <DialogContent>
          {renderBranchHasRemoteWarning(this.props.branch)}
          <RefNameTextBox
            label="Name"
            ariaDescribedBy={hasError ? this.ERRORS_ID : undefined}
            initialValue={this.props.branch.name}
            onValueChange={this.onNameChange}
          />

          {renderBranchNameRuleError(
            this.state.currentError,
            this.ERRORS_ID,
            this.state.newName
          )}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={`Rename ${this.props.branch.name}`}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChange = (name: string) => {
    this.setState({ newName: name, currentError: null })

    if (this.branchRulesDebounceId !== null) {
      window.clearTimeout(this.branchRulesDebounceId)
    }

    if (name !== '') {
      this.branchRulesDebounceId = window.setTimeout(
        this.checkBranchRules,
        500,
        name
      )
    }
  }

  private checkBranchRules = async (branchName: string) => {
    if (
      this.state.newName !== branchName ||
      branchName === '' ||
      this.state.currentError !== null
    ) {
      return
    }

    const result = await checkBranchNameRules(
      branchName,
      this.props.accounts,
      this.props.repository,
      this.props.cachedRepoRulesets
    )

    // Make sure user branch name hasn't changed during async calls
    if (this.state.newName !== branchName) {
      return
    }

    if (result !== null) {
      this.setState({ currentError: result })
    }
  }

  private renameBranch = () => {
    this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      this.state.newName
    )
    this.props.onDismissed()
  }
}
