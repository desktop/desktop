import * as React from 'react'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TextBox } from '../lib/text-box'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showOpenDialog } from '../main-process-proxy'
import { addWorktree } from '../../lib/git/worktree'

interface IAddWorktreeDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IAddWorktreeDialogState {
  readonly parentDirPath: string
  readonly branchName: string
  readonly creating: boolean
}

export class AddWorktreeDialog extends React.Component<
  IAddWorktreeDialogProps,
  IAddWorktreeDialogState
> {
  private branchNameTextBoxRef = React.createRef<RefNameTextBox>()

  public constructor(props: IAddWorktreeDialogProps) {
    super(props)

    this.state = {
      parentDirPath: Path.dirname(props.repository.path),
      branchName: '',
      creating: false,
    }
  }

  public componentDidMount() {
    this.branchNameTextBoxRef.current?.focus()
  }

  private onParentDirPathChanged = (parentDirPath: string) => {
    this.setState({ parentDirPath })
  }

  private onBranchNameChanged = (branchName: string) => {
    this.setState({ branchName })
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.setState({ parentDirPath: path })
  }

  private onSubmit = async () => {
    const { parentDirPath: path, branchName } = this.state
    const { dispatcher } = this.props

    this.setState({ creating: true })
    const worktreePath = Path.join(path, branchName)

    try {
      await addWorktree(this.props.repository, worktreePath, {
        createBranch: branchName.length > 0 ? branchName : undefined,
      })
    } catch (e) {
      dispatcher.postError(e)
      this.setState({ creating: false })
      return
    }

    const addedRepos = await dispatcher.addRepositories([worktreePath])

    if (addedRepos.length > 0) {
      await dispatcher.selectRepository(addedRepos[0])
    }

    this.setState({ creating: false })
    this.props.onDismissed()
  }

  public render() {
    const disabled =
      !this.state.parentDirPath ||
      !this.state.branchName ||
      this.state.creating ||
      !Path.isAbsolute(this.state.parentDirPath)

    return (
      <Dialog
        id="add-worktree"
        title={__DARWIN__ ? 'Add Worktree' : 'Add worktree'}
        loading={this.state.creating}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              value={this.state.parentDirPath}
              label={__DARWIN__ ? 'Parent Folder' : 'Parent folder'}
              placeholder="Parent folder path"
              onValueChanged={this.onParentDirPathChanged}
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>

          <Row>
            <RefNameTextBox
              label={__DARWIN__ ? 'New Workspace Name' : 'New workspace name'}
              initialValue=""
              onValueChange={this.onBranchNameChanged}
              ref={this.branchNameTextBoxRef}
            />
          </Row>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Worktree' : 'Create worktree'}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
