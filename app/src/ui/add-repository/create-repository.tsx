import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as OS from 'os'
import * as FS from 'fs'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository, createCommit, getStatus } from '../../lib/git'
import { sanitizedRepositoryName } from './sanitized-repository-name'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { writeDefaultReadme } from './write-default-readme'
import { Select } from '../lib/select'
import { getGitIgnoreNames } from './gitignores'

/** The sentinel value used to indicate no gitignore should be used. */
const NoGitIgnoreValue = 'None'

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICreateRepositoryState {
  readonly path: string
  readonly name: string

  /** Should the repository be created with a default README? */
  readonly createWithReadme: boolean

  /** The names for the available gitignores. */
  readonly gitIgnoreNames: ReadonlyArray<string> | null

  /** The gitignore to include in the repository. */
  readonly gitIgnore: string
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = {
      path: defaultPath(),
      name: '',
      createWithReadme: false,
      gitIgnoreNames: null,
      gitIgnore: NoGitIgnoreValue,
    }
  }

  public async componentDidMount() {
    const gitIgnoreNames = await getGitIgnoreNames()
    this.setState({
      path: this.state.path,
      name: this.state.name,
      createWithReadme: this.state.createWithReadme,
      gitIgnoreNames,
      gitIgnore: this.state.gitIgnore,
    })
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({
      path,
      name: this.state.name,
      createWithReadme: this.state.createWithReadme,
      gitIgnoreNames: this.state.gitIgnoreNames,
      gitIgnore: this.state.gitIgnore,
    })
  }

  private onNameChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const name = event.currentTarget.value
    this.setState({
      path: this.state.path,
      name,
      createWithReadme: this.state.createWithReadme,
      gitIgnoreNames: this.state.gitIgnoreNames,
      gitIgnore: this.state.gitIgnore,
    })
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]
    this.setState({
      path,
      name: this.state.name,
      createWithReadme: this.state.createWithReadme,
      gitIgnoreNames: this.state.gitIgnoreNames,
      gitIgnore: this.state.gitIgnore,
    })
  }

  private createRepository = async () => {
    const fullPath = Path.join(this.state.path, sanitizedRepositoryName(this.state.name))

    // NB: This exists & create check is race-y :(
    FS.exists(fullPath, exists => {
      FS.mkdir(fullPath, async () => {
        await initGitRepository(fullPath)

        const repositories = await this.props.dispatcher.addRepositories([ fullPath ])
        if (repositories.length < 1) { return }

        const repository = repositories[0]

        if (this.state.createWithReadme) {
          try {
            await writeDefaultReadme(fullPath, this.state.name)

            const status = await getStatus(repository)
            const wd = status.workingDirectory
            await createCommit(repository, 'Initial commit', wd.files)
          } catch (e) {
            console.error('Error creating initial commit:')
            console.error(e)
          }
        }

        this.props.dispatcher.selectRepository(repository)
        this.props.dispatcher.closePopup()
      })
    })
  }

  private onCreateWithREADMEChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      path: this.state.path,
      name: this.state.name,
      createWithReadme: event.currentTarget.checked,
      gitIgnoreNames: this.state.gitIgnoreNames,
      gitIgnore: this.state.gitIgnore,
    })
  }

  private renderError() {
    const sanitizedName = sanitizedRepositoryName(this.state.name)
    if (this.state.name === sanitizedName) { return null }

    return (
      <div>Will be created as {sanitizedName}</div>
    )
  }

  private onGitIgnoreChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const gitIgnore = event.currentTarget.value
    this.setState({
      path: this.state.path,
      name: this.state.name,
      createWithReadme: this.state.createWithReadme,
      gitIgnoreNames: this.state.gitIgnoreNames,
      gitIgnore,
    })
  }

  private renderGitIgnores() {
    const gitIgnores = this.state.gitIgnoreNames || []
    const options = [ 'None', ...gitIgnores ]

    return (
      <Select
        label='Git Ignore'
        value={this.state.gitIgnore}
        onChange={this.onGitIgnoreChange}
      >
        {options.map(n => <option key={n} value={n}>{n}</option>)}
      </Select>
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
          value={this.state.createWithReadme ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onCreateWithREADMEChange}/>

        {this.renderGitIgnores()}

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
