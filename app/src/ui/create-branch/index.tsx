import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { sanitizedBranchName } from './sanitized-branch-name'
import { Branch } from '../../models/branch'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly branches: ReadonlyArray<Branch>
  readonly currentBranch: Branch | null
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string
  readonly sanitizedName: string
  readonly baseBranch: Branch | null
}

/** The Create Branch component. */
export class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: '',
      sanitizedName: '',
      baseBranch: this.props.currentBranch,
    }
  }

  private renderError() {
    const error = this.state.currentError
    if (error) {
      return <div>{error.message}</div>
    } else {
      if (this.state.proposedName === this.state.sanitizedName) { return null }

      return (
        <div>Will be created as {this.state.sanitizedName}</div>
      )
    }
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName.length || !!this.state.currentError
    const currentBranch = this.props.currentBranch
    return (
      <Form onSubmit={this.createBranch}>
        <TextBox
          label='Name'
          autoFocus={true}
          onChange={this.onBranchNameChange}
          onKeyDown={this.onKeyDown}/>

        {this.renderError()}

        <Select
          label='From'
          onChange={this.onBaseBranchChange}
          defaultValue={currentBranch ? currentBranch.name : undefined}>
          {this.props.branches.map(branch =>
            <option key={branch.name} value={branch.name}>{branch.name}</option>
          )}
        </Select>

        <Button type='submit' disabled={disabled}>{__DARWIN__ ? 'Create Branch' : 'Create branch'}</Button>
      </Form>
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      this.props.dispatcher.closePopup()
    }
  }

  private onBranchNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    const str = event.currentTarget.value
    const sanitizedName = sanitizedBranchName(str)
    const alreadyExists = this.props.branches.findIndex(b => b.name === sanitizedName) > -1
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

  private onBaseBranchChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const baseBranchName = event.currentTarget.value
    const baseBranch = this.props.branches.find(b => b.name === baseBranchName)!
    this.setState({
      currentError: this.state.currentError,
      proposedName: this.state.proposedName,
      baseBranch,
      sanitizedName: this.state.sanitizedName,
    })
  }

  private createBranch = async () => {
    const name = this.state.sanitizedName
    const baseBranch = this.state.baseBranch
    if (name.length > 0 && baseBranch) {
      await this.props.dispatcher.createBranch(this.props.repository, name, baseBranch.name)
    }

    this.props.dispatcher.closeFoldout()
  }
}
