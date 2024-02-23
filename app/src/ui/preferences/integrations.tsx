import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { Select } from '../lib/select'
import { Shell, parse as parseShell } from '../../lib/shells'
import { suggestedExternalEditor } from '../../lib/editors/shared'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IIntegrationsPreferencesProps {
  readonly isWslAvailable: boolean
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedExternalEditor: string | null
  readonly wslExternalEditorRemote: boolean
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly wslOwnShell: boolean
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onWslExternalEditorRemoteChanged: (remote: boolean) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
  readonly onWslOwnShellChanged: (own: boolean) => void
}

interface IIntegrationsPreferencesState {
  readonly selectedExternalEditor: string | null
  readonly wslExternalEditorRemote: boolean
  readonly selectedShell: Shell
  readonly wslOwnShell: boolean
}

export class Integrations extends React.Component<
  IIntegrationsPreferencesProps,
  IIntegrationsPreferencesState
> {
  public constructor(props: IIntegrationsPreferencesProps) {
    super(props)

    this.state = {
      selectedExternalEditor: this.props.selectedExternalEditor,
      wslExternalEditorRemote: this.props.wslExternalEditorRemote,
      selectedShell: this.props.selectedShell,
      wslOwnShell: this.props.wslOwnShell,
    }
  }

  public async componentWillReceiveProps(
    nextProps: IIntegrationsPreferencesProps
  ) {
    const editors = nextProps.availableEditors
    let selectedExternalEditor = nextProps.selectedExternalEditor
    if (editors.length) {
      const indexOf = selectedExternalEditor
        ? editors.indexOf(selectedExternalEditor)
        : -1
      if (indexOf === -1) {
        selectedExternalEditor = editors[0]
        nextProps.onSelectedEditorChanged(selectedExternalEditor)
      }
    }

    const shells = nextProps.availableShells
    let selectedShell = nextProps.selectedShell
    if (shells.length) {
      const indexOf = shells.indexOf(selectedShell)
      if (indexOf === -1) {
        selectedShell = shells[0]
        nextProps.onSelectedShellChanged(selectedShell)
      }
    }

    this.setState({
      selectedExternalEditor,
      selectedShell,
    })
  }

  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    if (value) {
      this.setState({ selectedExternalEditor: value })
      this.props.onSelectedEditorChanged(value)
    }
  }

  private onWslExternalEditorRemoteChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked
    this.setState({ wslExternalEditorRemote: value })
    this.props.onWslExternalEditorRemoteChanged(value)
  }

  private onSelectedShellChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = parseShell(event.currentTarget.value)
    this.setState({ selectedShell: value })
    this.props.onSelectedShellChanged(value)
  }

  private onWslOwnShellChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked
    this.setState({ wslOwnShell: value })
    this.props.onWslOwnShellChanged(value)
  }

  private renderExternalEditor() {
    const options = this.props.availableEditors
    const selectedEditor = this.state.selectedExternalEditor
    const label = __DARWIN__ ? 'External Editor' : 'External editor'

    if (options.length === 0) {
      // this is emulating the <Select/> component's UI so the styles are
      // consistent for either case.
      //
      // TODO: see whether it makes sense to have a fallback UI
      // which we display when the select list is empty
      return (
        <div className="select-component no-options-found">
          <label>{label}</label>
          <span>
            No editors found.{' '}
            <LinkButton uri={suggestedExternalEditor.url}>
              Install {suggestedExternalEditor.name}?
            </LinkButton>
          </span>
        </div>
      )
    }

    return (
      <Select
        label={label}
        value={selectedEditor ? selectedEditor : undefined}
        onChange={this.onSelectedEditorChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    )
  }

  private renderWslExternalEditorRemote() {
    return (
      <Checkbox
        label="WSL: Open in remote, if editor supports it"
        value={
          this.state.wslExternalEditorRemote
            ? CheckboxValue.On
            : CheckboxValue.Off
        }
        onChange={this.onWslExternalEditorRemoteChanged}
      />
    )
  }

  private renderSelectedShell() {
    const options = this.props.availableShells

    return (
      <Select
        label="Shell"
        value={this.state.selectedShell}
        onChange={this.onSelectedShellChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    )
  }

  private renderWslOwnShell() {
    return (
      <Checkbox
        label="WSL: Use own shell"
        value={this.state.wslOwnShell ? CheckboxValue.On : CheckboxValue.Off}
        onChange={this.onWslOwnShellChanged}
      />
    )
  }

  public render() {
    return (
      <DialogContent>
        <h2>Applications</h2>

        <Row>{this.renderExternalEditor()}</Row>

        {this.props.isWslAvailable && (
          <Row>{this.renderWslExternalEditorRemote()}</Row>
        )}

        <Row>{this.renderSelectedShell()}</Row>

        {this.props.isWslAvailable && <Row>{this.renderWslOwnShell()}</Row>}
      </DialogContent>
    )
  }
}
