import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { sanitizedBranchName } from '../../lib/sanitize-branch'
import { Branch } from '../../models/branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { TipState, IUnbornRepository, IDetachedHead, IValidBranch } from '../../models/tip'
import { assertNever } from '../../lib/fatal-error'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly tip: IUnbornRepository | IDetachedHead | IValidBranch
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string
  readonly sanitizedName: string
  readonly baseBranch: Branch | null
  readonly loading: boolean
}

/** The Create Branch component. */
export class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: '',
      sanitizedName: '',
      baseBranch: this.props.defaultBranch,
      loading: false,
    }
  }

  private renderBranchSelection() {
    const tip = this.props.tip
    const tipKind = tip.kind

    if (tip.kind === TipState.Detached) {
      return (
        <p>
          You do not currently have any branch checked out (your HEAD reference
          is detached). As such your new branch will be based on your
          currently checked out commit ({tip.currentSha.substr(0, 7)}).
        </p>
      )
    } else if (tip.kind === TipState.Unborn) {
      return (
        <p>
          Your current branch is unborn (does not yet contain any commits).
          Creating a new branch now rename the current branch.
        </p>
      )
    } else if (tip.kind === TipState.Valid) {

      const currentBranch = tip.branch
      const defaultBranch = this.props.defaultBranch

      if (!defaultBranch || defaultBranch.name === currentBranch.name) {
        return (
          <p>
            Your new branch will be based on your currently checked out
            branch ({currentBranch.name}). 
          </p>
        )
      } else {
        const items = [
          { title: currentBranch.name },
          { title: defaultBranch.name }
        ]

        return (
          <VerticalSegmentedControl
            items={items}
            selectedIndex={0}
            onSelectionChanged={this.onBaseBranchChanged}
          />
        )
      }

    } else {
      return assertNever(tip, `Unknown tip kind ${tipKind}`)
    }
  }

  private onBaseBranchChanged = (selectedIndex: number) => {
  }

  private renderSanitizedName() {
    if (this.state.proposedName === this.state.sanitizedName) { return null }

    return (
      <Row className='warning-helper-text'>
        <Octicon symbol={OcticonSymbol.alert} />
        Will be created as {this.state.sanitizedName}
      </Row>
    )
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName.length || !!this.state.currentError
    const error = this.state.currentError

    return (
      <Dialog
        id='create-branch'
        title='Create a branch'
        onSubmit={this.createBranch}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
        disabled={this.state.loading}
      >
        {error ? <DialogError>{error.message}</DialogError> : null}

        <DialogContent>
          <Row>
            <TextBox
              label='Name'
              autoFocus={true}
              onChange={this.onBranchNameChange} />
          </Row>

          {this.renderSanitizedName()}

          {this.renderBranchSelection()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>{__DARWIN__ ? 'Create Branch' : 'Create branch'}</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onBranchNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    const str = event.currentTarget.value
    const sanitizedName = sanitizedBranchName(str)
    const alreadyExists = this.props.allBranches.findIndex(b => b.name === sanitizedName) > -1
    let currentError: Error | null = null
    if (alreadyExists) {
      currentError = new Error(`A branch named ${sanitizedName} already exists`)
    }

    this.setState({
      currentError,
      proposedName: str,
      baseBranch: this.state.baseBranch,
      sanitizedName,
    })
  }

  private createBranch = async () => {
    const name = this.state.sanitizedName
    const baseBranch = this.state.baseBranch
    if (name.length > 0 && baseBranch) {
      this.setState({ loading: true })
      await this.props.dispatcher.createBranch(this.props.repository, name, baseBranch.name)
      this.props.onDismissed()
    }
  }
}
