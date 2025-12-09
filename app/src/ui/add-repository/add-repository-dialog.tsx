import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TabBar } from '../tab-bar'
import { Account } from '../../models/account'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { getDefaultDir, setDefaultDir } from '../lib/default-dir'
import { FoldoutType } from '../../lib/app-state'
import { showOpenDialog } from '../main-process-proxy'
import {
  initGitRepository,
  createCommit,
  getStatus,
  getRepositoryType,
  RepositoryType,
} from '../../lib/git'
import { mkdir } from 'fs/promises'
import { parseRepositoryIdentifier, parseRemote } from '../../lib/remote-parsing'
import untildify from 'untildify'

/** The tabs available in the unified Add Repository dialog */
export enum AddRepositoryTab {
  Create = 0,
  Clone = 1,
  Add = 2,
}

interface IAddRepositoryDialogProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The initially selected tab */
  readonly initialTab?: AddRepositoryTab

  /** Accounts for clone functionality */
  readonly accounts: ReadonlyArray<Account>

  /** Whether this dialog is the top most */
  readonly isTopMost: boolean
}

interface IAddRepositoryDialogState {
  readonly selectedTab: AddRepositoryTab

  // Create tab state
  readonly createPath: string | null
  readonly createName: string
  readonly createDescription: string
  readonly isCreating: boolean
  readonly createError: string | null
  readonly isExistingRepo: boolean

  // Clone tab state
  readonly cloneUrl: string
  readonly clonePath: string | null
  readonly isCloning: boolean
  readonly cloneError: string | null

  // Add tab state
  readonly addPath: string
  readonly isAdding: boolean
  readonly addError: string | null
  readonly showNonGitRepoWarning: boolean
}

/**
 * Unified dialog for adding repositories - combines Create, Clone, and Add Local
 */
export class AddRepositoryDialog extends React.Component<
  IAddRepositoryDialogProps,
  IAddRepositoryDialogState
> {
  public constructor(props: IAddRepositoryDialogProps) {
    super(props)
    this.state = {
      selectedTab: props.initialTab ?? AddRepositoryTab.Create,

      // Create state
      createPath: null,
      createName: '',
      createDescription: '',
      isCreating: false,
      createError: null,
      isExistingRepo: false,

      // Clone state
      cloneUrl: '',
      clonePath: null,
      isCloning: false,
      cloneError: null,

      // Add state
      addPath: '',
      isAdding: false,
      addError: null,
      showNonGitRepoWarning: false,
    }
  }

  public async componentDidMount() {
    const defaultPath = await getDefaultDir()
    this.setState({
      createPath: defaultPath,
      clonePath: defaultPath,
    })
  }

  private onTabSelected = (tab: AddRepositoryTab) => {
    this.setState({ selectedTab: tab })
  }

  private getDialogTitle(): string {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.Create:
        return __DARWIN__ ? 'Add Repository' : 'Add repository'
      case AddRepositoryTab.Clone:
        return __DARWIN__ ? 'Add Repository' : 'Add repository'
      case AddRepositoryTab.Add:
        return __DARWIN__ ? 'Add Repository' : 'Add repository'
    }
  }

  // ============ CREATE TAB ============

  private onCreateNameChanged = (name: string) => {
    this.setState({ createName: name })
    this.checkIfExistingRepo(this.state.createPath, name)
  }

  private onCreatePathChanged = (path: string) => {
    this.setState({ createPath: path })
    this.checkIfExistingRepo(path, this.state.createName)
  }

  private async checkIfExistingRepo(path: string | null, name: string) {
    if (!path || !name) {
      this.setState({ isExistingRepo: false })
      return
    }
    const fullPath = Path.join(path, name)
    const type = await getRepositoryType(fullPath).catch(() => ({ kind: 'missing' } as RepositoryType))
    const isRepo = type.kind !== 'missing'
    this.setState({ isExistingRepo: isRepo })
  }

  private showCreateFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })
    if (path) {
      this.setState({ createPath: path })
    }
  }

  private createRepository = async () => {
    const { createPath, createName } = this.state
    if (!createPath || !createName.trim()) return

    const fullPath = Path.join(createPath, createName)
    this.setState({ isCreating: true, createError: null })

    try {
      await mkdir(fullPath, { recursive: true })
      await initGitRepository(fullPath)

      const repositories = await this.props.dispatcher.addRepositories([fullPath])
      if (repositories.length > 0) {
        const repository = repositories[0]
        const status = await getStatus(repository, true, true)
        if (status && status.workingDirectory.files.length > 0) {
          await createCommit(repository, 'Initial commit', status.workingDirectory.files)
        }

        setDefaultDir(createPath)
        this.props.dispatcher.closeFoldout(FoldoutType.Repository)
        this.props.dispatcher.selectRepository(repository)
        this.props.dispatcher.recordCreateRepository()
        this.props.onDismissed()
      }
    } catch (e: any) {
      this.setState({ createError: e.message || 'Failed to create repository' })
    } finally {
      this.setState({ isCreating: false })
    }
  }

  private renderCreateTab() {
    const { createPath, createName, createError, isExistingRepo } = this.state

    return (
      <DialogContent>
        <Row>
          <TextBox
            value={createName}
            label="Name"
            placeholder="repository name"
            onValueChanged={this.onCreateNameChanged}
          />
        </Row>

        <Row>
          <TextBox
            value={createPath ?? ''}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.onCreatePathChanged}
          />
          <Button onClick={this.showCreateFilePicker}>Choose...</Button>
        </Row>

        {isExistingRepo && (
          <Row className="warning-text">
            A repository already exists at this location.
          </Row>
        )}

        {createError && (
          <Row className="error-text">
            {createError}
          </Row>
        )}

        {createPath && createName && !isExistingRepo && (
          <Row className="path-info">
            Repository will be created at: {Path.join(createPath, createName)}
          </Row>
        )}
      </DialogContent>
    )
  }

  // ============ CLONE TAB ============

  private onCloneUrlChanged = (url: string) => {
    this.setState({ cloneUrl: url, cloneError: null })
  }

  private onClonePathChanged = (path: string) => {
    this.setState({ clonePath: path })
  }

  private showCloneFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })
    if (path) {
      this.setState({ clonePath: path })
    }
  }

  private cloneRepository = async () => {
    const { cloneUrl, clonePath } = this.state
    if (!cloneUrl.trim() || !clonePath) return

    this.setState({ isCloning: true, cloneError: null })

    try {
      // Parse the URL to determine the destination folder name
      const parsed = parseRepositoryIdentifier(cloneUrl) || parseRemote(cloneUrl)
      const destName = parsed?.name || 'repository'
      const fullPath = Path.join(clonePath, destName)

      await this.props.dispatcher.clone(cloneUrl, fullPath)
      setDefaultDir(clonePath)
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
      this.props.onDismissed()
    } catch (e: any) {
      this.setState({ cloneError: e.message || 'Failed to clone repository' })
    } finally {
      this.setState({ isCloning: false })
    }
  }

  private renderCloneTab() {
    const { cloneUrl, clonePath, cloneError } = this.state

    return (
      <DialogContent>
        <Row>
          <TextBox
            value={cloneUrl}
            label={__DARWIN__ ? 'Repository URL or GitHub username/repo' : 'Repository URL or GitHub username/repo'}
            placeholder="https://github.com/owner/repo or owner/repo"
            onValueChanged={this.onCloneUrlChanged}
          />
        </Row>

        <Row>
          <TextBox
            value={clonePath ?? ''}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="clone destination"
            onValueChanged={this.onClonePathChanged}
          />
          <Button onClick={this.showCloneFilePicker}>Choose...</Button>
        </Row>

        {cloneError && (
          <Row className="error-text">
            {cloneError}
          </Row>
        )}
      </DialogContent>
    )
  }

  // ============ ADD TAB ============

  private onAddPathChanged = async (path: string) => {
    this.setState({ addPath: path, addError: null })
    await this.validateAddPath(path)
  }

  private async validateAddPath(path: string) {
    if (!path) {
      this.setState({ showNonGitRepoWarning: false })
      return
    }

    const type = await getRepositoryType(path)
    const isRepo = type.kind !== 'missing' && type.kind !== 'unsafe'
    this.setState({ showNonGitRepoWarning: !isRepo && path.length > 0 })
  }

  private showAddFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })
    if (path) {
      this.setState({ addPath: path })
      await this.validateAddPath(path)
    }
  }

  private addRepository = async () => {
    const { addPath } = this.state
    if (!addPath.trim()) return

    this.setState({ isAdding: true, addError: null })

    try {
      const resolvedPath = Path.resolve('/', untildify(addPath))
      const repositories = await this.props.dispatcher.addRepositories([resolvedPath])

      if (repositories.length > 0) {
        this.props.dispatcher.closeFoldout(FoldoutType.Repository)
        this.props.dispatcher.selectRepository(repositories[0])
        this.props.dispatcher.recordAddExistingRepository()
        this.props.onDismissed()
      }
    } catch (e: any) {
      this.setState({ addError: e.message || 'Failed to add repository' })
    } finally {
      this.setState({ isAdding: false })
    }
  }

  private renderAddTab() {
    const { addPath, addError, showNonGitRepoWarning } = this.state

    return (
      <DialogContent>
        <Row>
          <TextBox
            value={addPath}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.onAddPathChanged}
          />
          <Button onClick={this.showAddFilePicker}>Choose...</Button>
        </Row>

        {showNonGitRepoWarning && (
          <Row className="warning-text">
            This directory does not appear to be a Git repository.
          </Row>
        )}

        {addError && (
          <Row className="error-text">
            {addError}
          </Row>
        )}
      </DialogContent>
    )
  }

  // ============ RENDER ============

  private renderActiveTab() {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.Create:
        return this.renderCreateTab()
      case AddRepositoryTab.Clone:
        return this.renderCloneTab()
      case AddRepositoryTab.Add:
        return this.renderAddTab()
    }
  }

  private getOkButtonText(): string {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.Create:
        return __DARWIN__ ? 'Create Repository' : 'Create repository'
      case AddRepositoryTab.Clone:
        return __DARWIN__ ? 'Clone Repository' : 'Clone repository'
      case AddRepositoryTab.Add:
        return __DARWIN__ ? 'Add Repository' : 'Add repository'
    }
  }

  private isOkDisabled(): boolean {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.Create:
        return !this.state.createPath || !this.state.createName.trim() || this.state.isCreating || this.state.isExistingRepo
      case AddRepositoryTab.Clone:
        return !this.state.cloneUrl.trim() || !this.state.clonePath || this.state.isCloning
      case AddRepositoryTab.Add:
        return !this.state.addPath.trim() || this.state.isAdding || this.state.showNonGitRepoWarning
    }
  }

  private isLoading(): boolean {
    return this.state.isCreating || this.state.isCloning || this.state.isAdding
  }

  private onSubmit = () => {
    switch (this.state.selectedTab) {
      case AddRepositoryTab.Create:
        return this.createRepository()
      case AddRepositoryTab.Clone:
        return this.cloneRepository()
      case AddRepositoryTab.Add:
        return this.addRepository()
    }
  }

  public render() {
    return (
      <Dialog
        id="add-repository-dialog"
        title={this.getDialogTitle()}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={this.isLoading()}
      >
        <TabBar
          selectedIndex={this.state.selectedTab}
          onTabClicked={this.onTabSelected}
        >
          <span>Create</span>
          <span>Clone</span>
          <span>Add Local</span>
        </TabBar>

        {this.renderActiveTab()}

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={this.getOkButtonText()}
            okButtonDisabled={this.isOkDisabled()}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
