import { remote } from 'electron'
import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository, isGitRepository } from '../../lib/git'
import { Button } from '../lib/button'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { FoldoutType } from '../../lib/app-state'
import { Dialog, DialogContent } from '../dialog'

const untildify: (str: string) => string = require('untildify')

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
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

  private onDismissed = () => {
    console.log('dismissed yo')
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.isGitRepository == null
    return (
      <Dialog
        title='Add local repository'
        onDismissed={this.onDismissed}>

        <DialogContent>
          <Form onSubmit={this.addRepository}>
            <Row>
              <TextBox
                value={this.state.path}
                label='Local Path'
                placeholder='repository path'
                onChange={this.onPathChanged}
                onKeyDown={this.onKeyDown}
                autoFocus/>
              <Button onClick={this.showFilePicker}>Choose…</Button>
            </Row>

            <Button disabled={disabled} type='submit'>
              {this.state.isGitRepository ? 'Add Repository' : 'Create & Add Repository'}
            </Button>
          </Form>
        </DialogContent>
      </Dialog>
    )
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.checkIfPathIsRepository(path)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Repository, expandAddRepository: false })
    }
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

    this.props.dispatcher.closeFoldout()
  }
}
