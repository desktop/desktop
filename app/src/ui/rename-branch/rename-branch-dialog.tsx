import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { sanitizedBranchName } from '../../lib/sanitize-branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { renderBranchNameWarning } from '../lib/branch-name-warnings'

interface IRenameBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
}

interface IRenameBranchState {
  readonly newName: string
}

export class RenameBranch extends React.Component<
  IRenameBranchProps,
  IRenameBranchState
> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name }
  }

  public render() {
    const disabled =
      !this.state.newName.length || /^\s*$/.test(this.state.newName)
    return (
      <Dialog
        id="rename-branch"
        title={__DARWIN__ ? 'Rename Branch' : 'Rename branch'}
        onDismissed={this.cancel}
        onSubmit={this.renameBranch}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              autoFocus={true}
              value={this.state.newName}
              onChange={this.onNameChange}
              onKeyDown={this.onKeyDown}
            />
          </Row>
          {renderBranchNameWarning(
            this.state.newName,
            sanitizedBranchName(this.state.newName)
          )}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              Rename {this.props.branch.name}
            </Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
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
    this.props.dispatcher.renameBranch(
      this.props.repository,
      this.props.branch,
      name
    )
    this.props.dispatcher.closePopup()
  }
}
