import * as React from 'react'
import * as Path from 'path'

import { TextBox } from './text-box'
import { Button } from './button'
import { Row } from './row'
import { getDefaultDir, setDefaultDir } from './default-dir'
import { showOpenDialog } from '../main-process-proxy'
import { InputWarning } from './input-description/input-warning'

// We use this instead of sanitizedRepositoryName because it deals with
// valid repository names on GitHub.com but here we only care about whether
// we'll be able to create a directory with the given name. If a user
// creates a repository with a name that GitHub.com doesn't like here it'll
// get sanitized in the Publish dialog later on.
//
// Note that we don't sanitize `\` or `/` here since we use `Path.join` to
// create the full path and that will handle those characters appropriately
// letting users type something like OrgA\RepoB and have the new repo be
// created in the OrgA folder.
//
// macOS and Linux are way more allowing so there's no need to sanitize
const safeDirectoryName = (name: string) => {
  return __WIN32__ ? name.replace(/[<>:"|?*]/g, '-').replace(/\s+$/, '') : name
}

interface IRepositoryPathProps {
  /** Initial name value. Defaults to ''. */
  readonly initialName?: string

  /**
   * Initial base path value. When null or undefined the component will
   * load the user's default directory on mount.
   */
  readonly initialPath?: string | null

  /**
   * Called whenever the resolved full path changes. The full path is
   * `Path.join(path, safeDirectoryName(name))`, or `null` when the name
   * is empty or the path has not yet loaded.
   */
  readonly onFullPathChanged: (fullPath: string | null) => void

  /** Called when the name changes. */
  readonly onNameChanged?: (name: string) => void

  /** Called when the base path changes. */
  readonly onPathChanged?: (path: string) => void

  /** Optional label for the name field. Defaults to "Name". */
  readonly nameLabel?: string

  /** Optional placeholder for the name field. */
  readonly namePlaceholder?: string

  /** Optional label for the path field. Defaults to "Local Path" / "Local path". */
  readonly pathLabel?: string

  /** Optional placeholder for the path field. */
  readonly pathPlaceholder?: string

  /** Optional aria-describedby for the name input. */
  readonly nameAriaDescribedBy?: string

  /** Optional aria-describedby for the path input. */
  readonly pathAriaDescribedBy?: string
}

interface IRepositoryPathState {
  readonly name: string
  readonly path: string | null
}

/**
 * Reusable component for the name + path fields used when creating a
 * repository or worktree directory. Manages its own state, loads the
 * default directory when no initial path is provided, handles the
 * Choose… file picker, and shows a warning when the name is sanitized
 * for the file system.
 *
 * The primary output is the `onFullPathChanged` callback which emits
 * the resolved full path or `null` when the inputs are incomplete.
 */
export class RepositoryPath extends React.Component<
  IRepositoryPathProps,
  IRepositoryPathState
> {
  /** Persists the given path as the default directory for future use. */
  public static setDefaultPath(path: string): void {
    setDefaultDir(path)
  }

  public constructor(props: IRepositoryPathProps) {
    super(props)
    this.state = {
      name: props.initialName ?? '',
      path: props.initialPath ?? null,
    }
  }

  public async componentDidMount() {
    if (this.state.path === null) {
      const path = await getDefaultDir()
      this.setState({ path }, () => this.notifyAll())
    } else {
      this.notifyAll()
    }
  }

  /**
   * Emit the current name, path, and full path to the parent. Called
   * once on mount (after default path loading if needed).
   */
  private notifyAll() {
    const { name, path } = this.state
    this.props.onNameChanged?.(name)
    if (path !== null) {
      this.props.onPathChanged?.(path)
    }
    this.emitFullPath()
  }

  private getFullPath(): string | null {
    const { name, path } = this.state
    if (path === null || path.length === 0 || name.trim().length === 0) {
      return null
    }
    return Path.join(path, safeDirectoryName(name))
  }

  private emitFullPath = () => {
    this.props.onFullPathChanged(this.getFullPath())
  }

  private onNameChanged = (name: string) => {
    this.setState({ name }, this.emitFullPath)
    this.props.onNameChanged?.(name)
  }

  private onPathChanged = (path: string) => {
    this.setState({ path }, this.emitFullPath)
    this.props.onPathChanged?.(path)
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.onPathChanged(path)
  }

  private renderSanitizedName() {
    const sanitizedName = safeDirectoryName(this.state.name)
    if (this.state.name === sanitizedName) {
      return null
    }

    return (
      <InputWarning
        id="repo-sanitized-name-warning"
        trackedUserInput={this.state.name}
        ariaLiveMessage={`Will be created as ${sanitizedName}. Invalid characters have been replaced by hyphens.`}
      >
        <p>Will be created as {sanitizedName}</p>
        <span className="sr-only">
          Invalid characters have been replaced by hyphens.
        </span>
      </InputWarning>
    )
  }

  public render() {
    const loadingPath = this.state.path === null

    return (
      <>
        <Row>
          <TextBox
            value={this.state.name}
            label={this.props.nameLabel ?? 'Name'}
            placeholder={this.props.namePlaceholder ?? 'name'}
            onValueChanged={this.onNameChanged}
            ariaDescribedBy={this.props.nameAriaDescribedBy}
          />
        </Row>

        {this.renderSanitizedName()}

        <Row>
          <TextBox
            value={this.state.path ?? ''}
            label={
              this.props.pathLabel ?? (__DARWIN__ ? 'Local Path' : 'Local path')
            }
            placeholder={this.props.pathPlaceholder ?? 'path'}
            onValueChanged={this.onPathChanged}
            disabled={loadingPath}
            ariaDescribedBy={this.props.pathAriaDescribedBy}
          />
          <Button onClick={this.showFilePicker} disabled={loadingPath}>
            Choose…
          </Button>
        </Row>
      </>
    )
  }
}
