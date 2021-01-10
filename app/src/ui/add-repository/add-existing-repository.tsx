import * as React from 'react'
import * as Path from 'path'

import { remote } from 'electron'
import { Dispatcher } from '../dispatcher'
import { isGitRepository } from '../../lib/git'
import { isBareRepository } from '../../lib/git'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../models/popup'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

import untildify from 'untildify'

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** An optional path to prefill the path text box with.
   * Defaults to the empty string if not defined.
   */
  readonly path?: string
}

interface IAddExistingRepositoryState {
  readonly path: string

  /**
   * Indicates whether or not the path provided in the path state field exists and
   * is a valid Git repository. This value is immediately switched
   * to false when the path changes and updated (if necessary) by the
   * function, checkIfPathIsRepository.
   *
   * If set to false the user will be prevented from submitting this dialog
   * and given the option to create a new repository instead.
   */
  readonly isRepository: boolean

  /**
   * Indicates whether or not to render a warning message about the entered path
   * not containing a valid Git repository. This value differs from `isGitRepository` in that it holds
   * its value when the path changes until we've gotten a definitive answer from the asynchronous
   * method that the path is, or isn't, a valid repository path. Separating the two means that
   * we don't toggle visibility of the warning message until it's really necessary, preventing
   * flickering for our users as they type in a path.
   */
  readonly showNonGitRepositoryWarning: boolean
  readonly isRepositoryBare: boolean
}

/** The component for adding an existing local repository. */
export class AddExistingRepository extends React.Component<
  IAddExistingRepositoryProps,
  IAddExistingRepositoryState
> {
  public constructor(props: IAddExistingRepositoryProps) {
    super(props)

    const path = this.props.path ? this.props.path : ''

    this.state = {
      path,
      isRepository: false,
      showNonGitRepositoryWarning: false,
      isRepositoryBare: false,
    }
  }

  public async componentDidMount() {
    const pathToCheck = this.state.path
    // We'll only have a path at this point if the dialog was opened with a path
    // to prefill.
    if (pathToCheck.length < 1) {
      return
    }

    const isRepository = await isGitRepository(pathToCheck)
    // The path might have changed while we were checking, in which case we
    // don't care about the result anymore.
    if (this.state.path !== pathToCheck) {
      return
    }

    const isBare = await isBareRepository(this.state.path)
    if (isBare === true) {
      this.setState({ isRepositoryBare: true })
      return
    }

    this.setState({ isRepository, showNonGitRepositoryWarning: !isRepository })
    this.setState({ isRepositoryBare: false })
  }

  private renderWarning() {
    if (!this.state.path.length || !this.state.showNonGitRepositoryWarning) {
      return null
    }

    if (this.state.isRepositoryBare) {
      return (
        <Row className="warning-helper-text">
          <Octicon symbol={OcticonSymbol.alert} />
          <p>
            This directory appears to be a bare repository. Bare repositories
            are not currently supported.
          </p>
        </Row>
      )
    }

    return (
      <Row className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />
        <p>
          This directory does not appear to be a Git repository.
          <br />
          Would you like to{' '}
          <LinkButton onClick={this.onCreateRepositoryClicked}>
            create a repository
          </LinkButton>{' '}
          here instead?
        </p>
      </Row>
    )
  }

  public render() {
    const disabled =
      this.state.path.length === 0 ||
      !this.state.isRepository ||
      this.state.isRepositoryBare

    return (
      <Dialog
        id="add-existing-repository"
        title={__DARWIN__ ? 'Add Local Repository' : 'Add local repository'}
        onSubmit={this.addRepository}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder="repository path"
              onValueChanged={this.onPathChanged}
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
          {this.renderWarning()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Add Repository' : 'Add repository'}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onPathChanged = async (path: string) => {
    const isRepository = await isGitRepository(path)

    this.setState({ path, isRepository })
  }

  private showFilePicker = async () => {
    const window = remote.getCurrentWindow()
    const { filePaths } = await remote.dialog.showOpenDialog(window, {
      properties: ['createDirectory', 'openDirectory'],
    })
    if (filePaths.length === 0) {
      return
    }

    const path = filePaths[0]
    const isRepository = await isGitRepository(path)
    const isRepositoryBare = await isBareRepository(path)

    this.setState({
      path,
      isRepository,
      showNonGitRepositoryWarning: !isRepository || isRepositoryBare,
      isRepositoryBare,
    })
  }

  private resolvedPath(path: string): string {
    return Path.resolve('/', untildify(path))
  }

  private addRepository = async () => {
    this.props.onDismissed()
    const { dispatcher } = this.props

    const resolvedPath = this.resolvedPath(this.state.path)
    const repositories = await dispatcher.addRepositories([resolvedPath])

    if (repositories.length > 0) {
      dispatcher.selectRepository(repositories[0])
      dispatcher.recordAddExistingRepository()
    }
  }

  private onCreateRepositoryClicked = () => {
    const resolvedPath = this.resolvedPath(this.state.path)

    return this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
      path: resolvedPath,
    })
  }
}
