import * as React from 'react'
import * as Path from 'path'

import { Dispatcher } from '../dispatcher'
import {
  initGitRepository,
  createCommit,
  getStatus,
  getAuthorIdentity,
  getRepositoryType,
  RepositoryType,
} from '../../lib/git'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { writeDefaultReadme } from './write-default-readme'
import { Select } from '../lib/select'
import { writeGitDescription } from '../../lib/git/description'
import { getGitIgnoreNames, writeGitIgnore } from './gitignores'
import { ILicense, getLicenses, writeLicense } from './licenses'
import { writeGitAttributes } from './git-attributes'
import { Dialog, DialogContent, DialogFooter, DialogError } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../models/popup'
import { Ref } from '../lib/ref'
import { enableReadmeOverwriteWarning } from '../../lib/feature-flag'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { mkdir } from 'fs/promises'
import { directoryExists } from '../../lib/directory-exists'
import { FoldoutType } from '../../lib/app-state'
import { join } from 'path'
import { isTopMostDialog } from '../dialog/is-top-most'
import { InputError } from '../lib/input-description/input-error'
import { InputWarning } from '../lib/input-description/input-warning'
import { CreateRepositoryError } from '../../lib/error-with-metadata'
import { RepositoryPath } from '../lib/repository-path'
import { pathExists } from '../../lib/path-exists'

/** URL used to provide information about submodules to the user. */
const submoduleDocsUrl = 'https://gh.io/git-submodules'

/** The sentinel value used to indicate no gitignore should be used. */
const NoGitIgnoreValue = 'None'

/** The sentinel value used to indicate no license should be used. */
const NoLicenseValue: ILicense = {
  name: 'None',
  featured: false,
  body: '',
  hidden: false,
}

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** Prefills path input so user doesn't have to. */
  readonly initialPath?: string

  /** Whether the dialog is the top most in the dialog stack */
  readonly isTopMost: boolean
}

interface ICreateRepositoryState {
  /** The resolved full path (path + sanitized name), or null if incomplete. */
  readonly fullPath: string | null

  /** The raw name entered by the user. Needed for readme/license/description. */
  readonly name: string

  /** The base directory path. Needed for persisting default directory. */
  readonly path: string | null

  readonly description: string

  /** Is the given path able to be written to? */
  readonly isValidPath: boolean | null

  /** Is the given path already a repository? */
  readonly isRepository: boolean

  /** Is the given path already a subfolder of a repository? */
  readonly isSubFolderOfRepository: boolean

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

  /**
   * Whether or not a README.md file already exists in the
   * directory that may be overwritten by initializing with
   * a new README.md.
   */
  readonly readMeExists: boolean
}

/** The Create New Repository component. */
export class CreateRepository extends React.Component<
  ICreateRepositoryProps,
  ICreateRepositoryState
> {
  private checkIsTopMostDialog = isTopMostDialog(
    () => {
      if (this.state.fullPath !== null) {
        this.updateReadMeExists(this.state.fullPath)
      }
      window.addEventListener('focus', this.onWindowFocus)
    },
    () => {
      window.removeEventListener('focus', this.onWindowFocus)
    }
  )

  public constructor(props: ICreateRepositoryProps) {
    super(props)

    this.state = {
      fullPath: null,
      path: null,
      name: '',
      description: '',
      createWithReadme: false,
      creating: false,
      gitIgnoreNames: null,
      gitIgnore: NoGitIgnoreValue,
      licenses: null,
      license: NoLicenseValue.name,
      isValidPath: null,
      isRepository: false,
      readMeExists: false,
      isSubFolderOfRepository: false,
    }
  }

  public async componentDidMount() {
    this.checkIsTopMostDialog(this.props.isTopMost)

    const gitIgnoreNames = await getGitIgnoreNames()
    const licenses = await getLicenses()

    this.setState({ gitIgnoreNames, licenses })
  }

  public componentDidUpdate(): void {
    this.checkIsTopMostDialog(this.props.isTopMost)
  }

  public componentWillUnmount(): void {
    this.checkIsTopMostDialog(false)
  }

  private onFullPathChanged = (fullPath: string | null) => {
    this.setState({
      fullPath,
      isRepository: false,
      isSubFolderOfRepository: false,
    })

    if (fullPath !== null) {
      this.updateIsRepository(fullPath)
      this.updateReadMeExists(fullPath)
    }
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private async updateIsRepository(fullPath: string) {
    const type = await getRepositoryType(fullPath).catch(e => {
      log.error(`Unable to determine repository type`, e)
      return { kind: 'missing' } as RepositoryType
    })

    let isRepository: boolean = type.kind !== 'missing'
    let isSubFolderOfRepository = false
    if (type.kind === 'unsafe') {
      // If the path is considered unsafe by Git we won't be able to
      // verify that it's a repository (or worktree). So we'll fall back to this
      // naive approximation.
      isRepository = await directoryExists(join(fullPath, '.git'))
    }

    if (type.kind === 'regular') {
      // If the path is a regular repository, we'll check if the top level. If it
      // isn't than, the path is a subfolder of the repository and a user may want
      // to make it into a repository.
      isRepository = type.topLevelWorkingDirectory === fullPath
      isSubFolderOfRepository = !isRepository
    }

    // Only update if the full path is still what we were checking.
    this.setState(state =>
      state.fullPath === fullPath
        ? { isRepository, isSubFolderOfRepository }
        : null
    )
  }

  private onDescriptionChanged = (description: string) => {
    this.setState({ description })
  }

  private async updateReadMeExists(fullPath: string) {
    if (!enableReadmeOverwriteWarning()) {
      return
    }

    const readMePath = Path.join(fullPath, 'README.md')
    const readMeExists = await pathExists(readMePath)

    // Only update if the full path is still current.
    this.setState(state =>
      state.fullPath === fullPath ? { readMeExists } : null
    )
  }

  private resolveRepositoryRoot(): string | null {
    return this.state.fullPath
  }

  private createRepository = async () => {
    const fullPath = this.resolveRepositoryRoot()

    if (fullPath === null) {
      // Shouldn't be able to get here with a null full path, but if you did,
      // display error.
      this.setState({ isValidPath: true })
      return
    }

    try {
      await mkdir(fullPath, { recursive: true })
      this.setState({ isValidPath: true })
    } catch (e) {
      if (e.code === 'EACCES' && e.errno === -13) {
        return this.setState({ isValidPath: false })
      }

      log.error(
        `createRepository: the directory at ${fullPath} is not valid`,
        e
      )
      return this.props.dispatcher.postError(e)
    }

    this.setState({ creating: true })

    try {
      await initGitRepository(fullPath)
    } catch (e) {
      this.setState({ creating: false })
      log.error(
        `createRepository: unable to initialize a Git repository at ${fullPath}`,
        e
      )
      return this.props.dispatcher.postError(e)
    }

    const repositories = await this.props.dispatcher.addRepositories([fullPath])
    if (repositories.length < 1) {
      return
    }

    const repository = repositories[0]

    if (this.state.createWithReadme) {
      try {
        await writeDefaultReadme(
          fullPath,
          this.state.name,
          this.state.description
        )
      } catch (e) {
        log.error(`createRepository: unable to write README at ${fullPath}`, e)
        this.props.dispatcher.postError(e)
      }
    }

    const gitIgnore = this.state.gitIgnore
    if (gitIgnore !== NoGitIgnoreValue) {
      try {
        await writeGitIgnore(fullPath, gitIgnore)
      } catch (e) {
        log.error(
          `createRepository: unable to write .gitignore file at ${fullPath}`,
          e
        )
        this.props.dispatcher.postError(e)
      }
    }

    const description = this.state.description
    if (description) {
      try {
        await writeGitDescription(fullPath, description)
      } catch (e) {
        log.error(
          `createRepository: unable to write .git/description file at ${fullPath}`,
          e
        )
        this.props.dispatcher.postError(e)
      }
    }

    const licenseName =
      this.state.license === NoLicenseValue.name ? null : this.state.license
    const license = (this.state.licenses || []).find(
      l => l.name === licenseName
    )

    if (license) {
      try {
        const author = await getAuthorIdentity(repository)

        await writeLicense(fullPath, license, {
          fullname: author ? author.name : '',
          email: author ? author.email : '',
          year: new Date().getFullYear().toString(),
          description: '',
          project: this.state.name,
        })
      } catch (e) {
        log.error(`createRepository: unable to write LICENSE at ${fullPath}`, e)
        this.props.dispatcher.postError(e)
      }
    }

    try {
      const gitAttributes = Path.join(fullPath, '.gitattributes')
      const gitAttributesExists = await pathExists(gitAttributes)
      if (!gitAttributesExists) {
        await writeGitAttributes(fullPath)
      }
    } catch (e) {
      log.error(
        `createRepository: unable to write .gitattributes at ${fullPath}`,
        e
      )
      this.props.dispatcher.postError(e)
    }

    const status = await getStatus(repository, true, true).catch(e => {
      log.error(`createRepository: unable to get status for ${fullPath}`, e)
      this.props.dispatcher.postError(new CreateRepositoryError(e))
      return null
    })

    if (status === null) {
      this.setState({ creating: false })
      return
    }

    try {
      const wd = status.workingDirectory
      const files = wd.files
      if (files.length > 0) {
        await createCommit(repository, 'Initial commit', files)
      }
    } catch (e) {
      log.error(`createRepository: initial commit failed at ${fullPath}`, e)
      this.props.dispatcher.postError(e)
    }

    this.setState({ creating: false })

    this.updateDefaultDirectory()

    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.recordCreateRepository()
    this.props.onDismissed()
  }

  private updateDefaultDirectory = () => {
    // don't update the default directory as a result of creating the
    // repository from an empty folder, because this value will be the
    // repository path itself
    if (!this.props.initialPath && this.state.path !== null) {
      RepositoryPath.setDefaultPath(this.state.path)
    }
  }

  private onCreateWithReadmeChange = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({
      createWithReadme: event.currentTarget.checked,
    })
  }

  private onGitIgnoreChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const gitIgnore = event.currentTarget.value
    this.setState({ gitIgnore })
  }

  private onLicenseChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const license = event.currentTarget.value
    this.setState({ license })
  }

  private renderGitIgnores() {
    const gitIgnores = this.state.gitIgnoreNames || []
    const options = [NoGitIgnoreValue, ...gitIgnores]

    return (
      <Row>
        <Select
          label={__DARWIN__ ? 'Git Ignore' : 'Git ignore'}
          value={this.state.gitIgnore}
          onChange={this.onGitIgnoreChange}
        >
          {options.map(n => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Row>
    )
  }

  private renderLicenses() {
    const licenses = this.state.licenses || []
    const featuredLicenses = [
      NoLicenseValue,
      ...licenses.filter(l => l.featured),
    ]
    const nonFeaturedLicenses = licenses.filter(l => !l.featured)

    return (
      <Row>
        <Select
          label="License"
          value={this.state.license}
          onChange={this.onLicenseChange}
        >
          {featuredLicenses.map(l => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
          <option disabled={true}>────────────────────</option>
          {nonFeaturedLicenses.map(l => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </Select>
      </Row>
    )
  }

  private renderInvalidPathError() {
    const isValidPath = this.state.isValidPath
    const pathSet = isValidPath !== null

    if (!pathSet || isValidPath) {
      return null
    }

    return (
      <DialogError>
        Directory could not be created at this path. You may not have
        permissions to create a directory here.
      </DialogError>
    )
  }

  private renderGitRepositoryError() {
    const { isRepository, fullPath } = this.state

    if (!fullPath || !isRepository) {
      return null
    }

    return (
      <Row>
        <InputError
          id="existing-repository-path-error"
          trackedUserInput={fullPath}
          ariaLiveMessage={`The directory ${fullPath} appears to be a Git repository. Would you like to add this repository instead?`}
        >
          The directory <Ref>{fullPath}</Ref>appears to be a Git repository.
          Would you like to{' '}
          <LinkButton onClick={this.onAddRepositoryClicked}>
            add this repository
          </LinkButton>{' '}
          instead?
        </InputError>
      </Row>
    )
  }

  private renderGitRepositorySubFolderMessage() {
    const { isSubFolderOfRepository, fullPath } = this.state

    if (!fullPath || !isSubFolderOfRepository) {
      return null
    }

    return (
      <Row>
        <InputWarning
          id="path-is-subfolder-of-repository"
          trackedUserInput={fullPath}
          ariaLiveMessage={`The directory ${fullPath} appears to be a subfolder Git repository. Did you know about submodules?`}
        >
          The directory <Ref>{fullPath}</Ref>appears to be a subfolder of Git
          repository.
          <LinkButton uri={submoduleDocsUrl}>
            Learn about submodules.
          </LinkButton>
        </InputWarning>
      </Row>
    )
  }

  private renderReadmeOverwriteWarning() {
    if (!enableReadmeOverwriteWarning()) {
      return null
    }

    if (
      this.state.createWithReadme === false ||
      this.state.readMeExists === false
    ) {
      return null
    }

    return (
      <Row>
        <InputWarning
          id="readme-overwrite-warning"
          trackedUserInput={this.state.createWithReadme}
          ariaLiveMessage="This directory contains a README.md file already. Checking
          this box will result in the existing file being overwritten."
        >
          This directory contains a <Ref>README.md</Ref> file already. Checking
          this box will result in the existing file being overwritten.
        </InputWarning>
      </Row>
    )
  }

  private renderPathMessage = () => {
    const { fullPath, isRepository } = this.state

    if (fullPath === null || isRepository) {
      return null
    }

    return (
      <div id="create-repo-path-msg">
        The repository will be created at <Ref>{fullPath}</Ref>.
      </div>
    )
  }

  private onAddRepositoryClicked = () => {
    this.props.onDismissed()

    const { fullPath } = this.state

    if (fullPath !== null) {
      this.props.dispatcher.showPopup({
        type: PopupType.AddRepository,
        path: fullPath,
      })
    }
  }

  public render() {
    const disabled =
      this.state.fullPath === null ||
      this.state.creating ||
      this.state.isRepository

    return (
      <Dialog
        id="create-repository"
        title={
          __DARWIN__ ? 'Create a New Repository' : 'Create a new repository'
        }
        loading={this.state.creating}
        onSubmit={this.createRepository}
        onDismissed={this.props.onDismissed}
      >
        {this.renderInvalidPathError()}

        <DialogContent>
          <RepositoryPath
            initialName={
              this.props.initialPath
                ? Path.basename(this.props.initialPath)
                : undefined
            }
            initialPath={
              this.props.initialPath
                ? Path.dirname(this.props.initialPath)
                : undefined
            }
            onFullPathChanged={this.onFullPathChanged}
            onNameChanged={this.onNameChanged}
            onPathChanged={this.onPathChanged}
            namePlaceholder="repository name"
            pathPlaceholder="repository path"
            nameAriaDescribedBy="existing-repository-path-error repo-sanitized-name-warning"
            pathAriaDescribedBy="existing-repository-path-error path-is-subfolder-of-repository"
          />

          <Row>
            <TextBox
              value={this.state.description}
              label="Description"
              onValueChanged={this.onDescriptionChanged}
            />
          </Row>

          {this.renderGitRepositoryError()}
          {this.renderGitRepositorySubFolderMessage()}

          <Row>
            <Checkbox
              label="Initialize this repository with a README"
              value={
                this.state.createWithReadme
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onCreateWithReadmeChange}
              ariaDescribedBy="readme-overwrite-warning"
            />
          </Row>
          {this.renderReadmeOverwriteWarning()}

          {this.renderGitIgnores()}
          {this.renderLicenses()}
        </DialogContent>

        <DialogFooter>
          {this.renderPathMessage()}
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__ ? 'Create Repository' : 'Create repository'
            }
            okButtonDisabled={disabled}
            okButtonAriaDescribedBy="create-repo-path-msg"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onWindowFocus = () => {
    // Verify whether or not a README.md file exists at the chosen directory
    // in case one has been added or removed and the warning can be displayed.
    if (this.state.fullPath !== null) {
      this.updateReadMeExists(this.state.fullPath)
    }
  }
}
