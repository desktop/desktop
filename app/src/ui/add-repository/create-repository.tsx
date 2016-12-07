import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as OS from 'os'
import * as FS from 'fs'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository } from '../../lib/git'
import { sanitizedRepositoryName } from './sanitized-repository-name'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICreateRepositoryState {
  readonly path: string
  readonly name: string
  readonly createWithREADME: boolean
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = {
      path: defaultPath(),
      name: '',
      createWithREADME: false,
    }
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({
      path,
      name: this.state.name,
      createWithREADME: this.state.createWithREADME,
    })
  }

  private onNameChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const name = event.currentTarget.value
    this.setState({
      path: this.state.path,
      name,
      createWithREADME: this.state.createWithREADME,
    })
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.setState({
      path,
      name: this.state.name,
      createWithREADME: this.state.createWithREADME,
    })
  }

  private createRepository = async () => {
    const fullPath = Path.join(this.state.path, sanitizedRepositoryName(this.state.name))

    // NB: This exists & create check is race-y :(
    FS.exists(fullPath, exists => {
      FS.mkdir(fullPath, async () => {
        await initGitRepository(fullPath)

        const repositories = await this.props.dispatcher.addRepositories([ fullPath ])

        if (repositories.length > 0) {
          this.props.dispatcher.selectRepository(repositories[0])
          this.props.dispatcher.closePopup()
        }
      })
    })
  }

  private onCreateWithREADMEChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      path: this.state.path,
      name: this.state.name,
      createWithREADME: event.currentTarget.checked,
    })
  }

  private renderError() {
    const sanitizedName = sanitizedRepositoryName(this.state.name)
    if (this.state.name === sanitizedName) { return null }

    return (
      <div>Will be created as {sanitizedName}</div>
    )
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.name.length === 0
    return (
      <Form>
        <TextBox
          value={this.state.name}
          label='Name'
          placeholder='repository name'
          onChange={this.onNameChanged}/>

        {this.renderError()}

        <Row>
          <TextBox
            value={this.state.path}
            label='Local Path'
            placeholder='repository path'
            onChange={this.onPathChanged}/>
          <Button onClick={this.showFilePicker}>Choose…</Button>
        </Row>

        <Checkbox
          label='Initialize this repository with a README'
          value={this.state.createWithREADME ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onCreateWithREADMEChange}/>

        <hr/>

        <Button type='submit' disabled={disabled} onClick={this.createRepository}>
          Create Repository
        </Button>
      </Form>
    )
  }
}

function defaultPath() {
  return OS.homedir() + Path.sep
}
