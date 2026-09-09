import * as React from 'react'
import { validateCopilotAppPath } from '../../lib/copilot-app'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { LinkButton } from '../lib/link-button'
import { InputError } from '../lib/input-description/input-error'
import { showOpenDialog } from '../main-process-proxy'

interface ICopilotAppDialogProps {
  readonly repositoryPath: string
  readonly appPath?: string
  readonly message: string
  readonly onDismissed: () => void
  readonly onOpen: (repositoryPath: string, appPath: string) => Promise<void>
}

interface ICopilotAppDialogState {
  readonly path: string
  readonly error: string | undefined
  readonly busy: boolean
}

/** Locate GitHub Copilot after a missing installation or failed handoff. */
export class CopilotAppDialog extends React.Component<
  ICopilotAppDialogProps,
  ICopilotAppDialogState
> {
  private mounted = false

  public constructor(props: ICopilotAppDialogProps) {
    super(props)
    this.state = {
      path: props.appPath ?? '',
      error: undefined,
      busy: false,
    }
  }

  public componentDidMount() {
    this.mounted = true
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private onPathChanged = (path: string) => {
    this.setState({ path, error: undefined })
  }

  private onChoosePath = async () => {
    try {
      const selected = await showOpenDialog({
        title: 'Choose GitHub Copilot',
        properties: __DARWIN__ ? ['openFile', 'openDirectory'] : ['openFile'],
        filters: [
          { name: 'GitHub Copilot', extensions: [__DARWIN__ ? 'app' : 'exe'] },
        ],
      })
      if (selected !== null && this.mounted) {
        this.onPathChanged(selected)
      }
    } catch (e) {
      log.error('Could not choose the GitHub Copilot app', e)
      if (this.mounted) {
        this.setState({
          error:
            'Could not open the file picker. Enter the app location instead.',
        })
      }
    }
  }

  private onSubmit = async () => {
    const { busy, path } = this.state
    const { repositoryPath, onDismissed, onOpen } = this.props
    if (busy) {
      return
    }
    this.setState({ busy: true })
    const valid = await validateCopilotAppPath(path)
    if (!this.mounted) {
      return
    }
    if (!valid) {
      this.setState({
        error: __DARWIN__
          ? 'Choose the GitHub Copilot application (.app).'
          : 'Choose the GitHub Copilot executable (github.exe).',
        busy: false,
      })
      return
    }

    onDismissed()
    await onOpen(repositoryPath, path)
  }

  public render() {
    const { path, error, busy } = this.state
    return (
      <Dialog
        id="copilot-app"
        title="Unable to open GitHub Copilot"
        type="error"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>{this.props.message}</p>
          <p>
            <LinkButton uri="https://gh.io/app">
              Download GitHub Copilot
            </LinkButton>
          </p>
          <TextBox
            label="App location"
            value={path}
            onValueChanged={this.onPathChanged}
            disabled={busy}
            ariaDescribedBy={
              error === undefined ? undefined : 'copilot-app-path-error'
            }
          />
          <Button onClick={this.onChoosePath} disabled={busy}>
            Choose...
          </Button>
          {error !== undefined && (
            <InputError id="copilot-app-path-error" ariaLiveMessage={error}>
              {error}
            </InputError>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Open GitHub Copilot"
            okButtonDisabled={busy || path.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
