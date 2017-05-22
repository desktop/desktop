import { remote } from 'electron'
import * as React from 'react'
import * as Path from 'path'
import * as FSE from 'fs-extra'

import { Dispatcher } from '../../lib/dispatcher'
import { initGitRepository, createCommit, getStatus, getAuthorIdentity } from '../../lib/git'
import { sanitizedRepositoryName } from './sanitized-repository-name'
import { TextBox } from '../lib/text-box'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { writeDefaultReadme } from './write-default-readme'
import { Select } from '../lib/select'
import { getGitIgnoreNames, writeGitIgnore } from './gitignores'
import { ILicense, getLicenses, writeLicense } from './licenses'
import { writeGitAttributes } from './git-attributes'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'

import { logError } from '../../lib/logging/renderer'

/** The sentinel value used to indicate no gitignore should be used. */
const NoGitIgnoreValue = 'None'

/** The sentinel value used to indicate no license should be used. */
const NoLicenseValue: ILicense = {
  name: 'None',
  featured: false,
  body: '',
}

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface ICreateRepositoryState {
  readonly path: string
  readonly name: string

  /** Should the repository be created with a default README? */
  readonly createWithReadme: boolean

  /** Is the repository currently in the process of being created? */
  readonly creating: boolean

  /** The names for the available gitignores. */
  readonly gitIgnoreNames: ReadonlyArray<string> | null

  /** The gitignore to include in the repository. */
  readonly gitIgnore: string

  /** The available licenses. */
  readonly licenses: ReadonlyArray<ILicense> | null

  /** The license to include in the repository. */
  readonly license: string
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<ICreateRepositoryProps, ICreateRepositoryState> {
  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = {
      path: getDefaultDir(),
      name: '',
      createWithReadme: false,
      creating: false,
      gitIgnoreNames: null,
      gitIgnore: NoGitIgnoreValue,
      licenses: null,
      license: NoLicenseValue.name,
    }
  }

  public async componentDidMount() {
    const gitIgnoreNames = await getGitIgnoreNames()
    this.setState({ ...this.state, gitIgnoreNames })

    const licenses = await getLicenses()
    this.setState({ ...this.state, licenses })
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({ ...this.state, path })
  }

  private onNameChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const name = event.currentTarget.value
    this.setState({ ...this.state, name })
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({ properties: [ 'createDirectory', 'openDirectory' ] })
    if (!directory) { return }

    const path = directory[0]

    this.setState({ ...this.state, path })
  }

  private ensureDirectory(directory: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        FSE.ensureDir(directory, (err) => {
          if (err) {
            return reject(err)
          }

          return resolve()
        })
    })
  }

  private createRepository = async () => {
    const fullPath = Path.join(this.state.path, sanitizedRepositoryName(this.state.name))

    try {
      await this.ensureDirectory(fullPath)
    } catch (e) {
      logError(`createRepository: the directory at ${fullPath} is not valid`, e)
      return this.props.dispatcher.postError(e)
    }

    this.setState({ ...this.state, creating: true })

    try {
      await initGitRepository(fullPath)
    } catch (e) {
      this.setState({ ...this.state, creating: false })
      logError(`createRepository: unable to initialize a Git repository at ${fullPath}`, e)
      return this.props.dispatcher.postError(e)
    }

    const repositories = await this.props.dispatcher.addRepositories([ fullPath ])
    if (repositories.length < 1) { return }

    const repository = repositories[0]

    if (this.state.createWithReadme) {
      try {
        await writeDefaultReadme(fullPath, this.state.name)
      } catch (e) {
        logError(`createRepository: unable to write README at ${fullPath}`, e)
        this.props.dispatcher.postError(e)
      }
    }

    const gitIgnore = this.state.gitIgnore
    if (gitIgnore !== NoGitIgnoreValue) {
      try {
        await writeGitIgnore(fullPath, gitIgnore)
      } catch (e) {
        logError(`createRepository: unable to write .gitignore file at ${fullPath}`, e)
        this.props.dispatcher.postError(e)
      }
    }

    const licenseName = (this.state.license === NoLicenseValue.name ? null : this.state.license)
    const license = (this.state.licenses || []).find(l => l.name === licenseName)

    if (license) {
      try {
        const author = await getAuthorIdentity(repository)

        await writeLicense(fullPath, license, {
          fullname: author ? author.name : '',
          email: author ? author.email : '',
          year: (new Date()).getFullYear().toString(),
          description: '',
          project: this.state.name,
        })
      } catch (e) {
        logError(`createRepository: unable to write LICENSE at ${fullPath}`, e)
        this.props.dispatcher.postError(e)
      }
    }

    try {
      await writeGitAttributes(fullPath)
    } catch (e) {
      logError(`createRepository: unable to write .gitattributes at ${fullPath}`, e)
      this.props.dispatcher.postError(e)
    }

    try {
      const status = await getStatus(repository)
      const wd = status.workingDirectory
      const files = wd.files
      if (files.length > 0) {
        await createCommit(repository, 'Initial commit', files)
      }
    } catch (e) {
      logError(`createRepository: initial commit failed at ${fullPath}`, e)
      this.props.dispatcher.postError(e)
    }

    this.setState({ ...this.state, creating: false })

    setDefaultDir(this.state.path)

    this.props.dispatcher.selectRepository(repository)
    this.props.onDismissed()
  }

  private onCreateWithReadmeChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ ...this.state, createWithReadme: event.currentTarget.checked })
  }

  private renderSanitizedName() {
    const sanitizedName = sanitizedRepositoryName(this.state.name)
    if (this.state.name === sanitizedName) { return null }

    return (
      <Row className='warning-helper-text'>
        <Octicon symbol={OcticonSymbol.alert} />
        Will be created as {sanitizedName}
      </Row>
    )
  }

  private onGitIgnoreChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const gitIgnore = event.currentTarget.value
    this.setState({ ...this.state, gitIgnore })
  }

  private onLicenseChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const license = event.currentTarget.value
    this.setState({ ...this.state, license })
  }

  private renderGitIgnores() {
    const gitIgnores = this.state.gitIgnoreNames || []
    const options = [ NoGitIgnoreValue, ...gitIgnores ]

    return (
      <Row>
        <Select
          label={ __DARWIN__ ? 'Git Ignore' : 'Git ignore' }
          value={this.state.gitIgnore}
          onChange={this.onGitIgnoreChange}
        >
          {options.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </Row>
    )
  }

  private renderLicenses() {
    const licenses = this.state.licenses || []
    const options = [ NoLicenseValue, ...licenses ]

    return (
      <Row>
        <Select
          label='License'
          value={this.state.license}
          onChange={this.onLicenseChange}
        >
          {options.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
        </Select>
      </Row>
    )
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.name.length === 0 || this.state.creating
    return (
      <Dialog
        title={__DARWIN__ ? 'Create a New Repository' : 'Create a new repository'}
        loading={this.state.creating}
        onSubmit={this.createRepository}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          <Row>
            <TextBox
              value={this.state.name}
              label='Name'
              placeholder='repository name'
              onChange={this.onNameChanged}
              autoFocus />
          </Row>

          {this.renderSanitizedName()}

          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder='repository path'
              onChange={this.onPathChanged} />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>

          <Row>
            <Checkbox
              label='Initialize this repository with a README'
              value={this.state.createWithReadme ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onCreateWithReadmeChange} />
          </Row>

          {this.renderGitIgnores()}

          {this.renderLicenses()}

        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>
              {__DARWIN__ ? 'Create Repository' : 'Create repository'}
            </Button>

            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
