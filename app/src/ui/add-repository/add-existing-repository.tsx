import { remote } from 'electron'
import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository, isGitRepository } from '../../lib/git'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

const untildify: (str: string) => string = require('untildify')

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IAddExistingRepositoryState {
  readonly path: string
  readonly isGitRepository: boolean | null
}

/** The component for adding or initializing a new local repository. */
export class AddExistingRepository extends React.Component<IAddExistingRepositoryProps, IAddExistingRepositoryState> {
  private checkGitRepositoryToken = 0

  public constructor(props: IAddExistingRepositoryProps) {
    super(props)

    this.state = { path: '', isGitRepository: false }
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.isGitRepository == null

    const submitButtonText = this.state.isGitRepository
      ? (__DARWIN__ ? 'Add Repository' : 'Add repository')
      : (__DARWIN__ ? 'Create & Add Repository' : 'Create & add repository')

    return (
      <Dialog
        title={__DARWIN__ ? 'Add Local Repository' : 'Add local repository'}
        onSubmit={this.addRepository}
        onDismissed={this.props.onDismissed}>

        <DialogContent>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder='repository path'
              onChange={this.onPathChanged}
              autoFocus/>
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type='submit'>
              {submitButtonText}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.checkIfPathIsRepository(path)
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.checkIfPathIsRepository(path)
  }

  private async checkIfPathIsRepository(path: string) {
    this.setState({ path, isGitRepository: null })

    const token = ++this.checkGitRepositoryToken

    const isRepo = await isGitRepository(this.resolvedPath(path))

    // Another path check was requested so don't update state based on the old
    // path.
    if (token !== this.checkGitRepositoryToken) { return }

    this.setState({ path: this.state.path, isGitRepository: isRepo })
  }

  private resolvedPath(path: string): string {
    return untildify(path)
  }

  private addRepository = async () => {
    const resolvedPath = this.resolvedPath(this.state.path)
    if (!this.state.isGitRepository) {
      await initGitRepository(resolvedPath)
    }

    const repositories = await this.props.dispatcher.addRepositories([ resolvedPath ])

    if (repositories && repositories.length) {
      const repository = repositories[0]
      this.props.dispatcher.selectRepository(repository)
    }

    this.props.onDismissed()
  }
}
