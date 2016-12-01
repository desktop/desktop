import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { sanitizedBranchName } from '../create-branch/sanitized-branch-name'
import { Form } from '../lib/form'
import { Input } from '../lib/input'
import { Button } from '../lib/button'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
}

interface IRenameBranchState {
  readonly newName: string
}

export class RenameBranch extends React.Component<IRenameBranchProps, IRenameBranchState> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name }
  }

  private renderError() {
    const sanitizedName = sanitizedBranchName(this.state.newName)
    if (sanitizedName !== this.state.newName) {
      return <div>Will be created as {sanitizedName}</div>
    } else {
      return null
    }
  }

  public render() {
    const disabled = !this.state.newName.length
    return (
      <Form onSubmit={this.renameBranch}>
        <Input
          label='Name'
          value={this.state.newName}
          onChange={this.onNameChange}
          onKeyDown={this.onKeyDown}/>

        {this.renderError()}

        <Button onClick={this.cancel}>Cancel</Button>
        <Button type='submit' disabled={disabled}>Rename {this.props.branch.name}</Button>
      </Form>
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      this.props.dispatcher.closePopup()
    }
  }

  private onNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ newName: event.currentTarget.value })
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private renameBranch = () => {
    const name = sanitizedBranchName(this.state.newName)
    this.props.dispatcher.renameBranch(this.props.repository, this.props.branch, name)
    this.props.dispatcher.closePopup()
  }
}
