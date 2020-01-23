import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { Select } from '../lib/select'
import { ExternalEditor, parse as parseEditor } from '../../lib/editors'
import { Shell, parse as parseShell } from '../../lib/shells'
import { TextBox } from '../lib/text-box'
import { enableMergeTool } from '../../lib/feature-flag'
import { IMergeTool } from '../../lib/git/config'

interface IIntegrationsPreferencesProps {
  readonly availableEditors: ReadonlyArray<ExternalEditor>
  readonly selectedExternalEditor: ExternalEditor | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly onSelectedEditorChanged: (editor: ExternalEditor) => void
  readonly onSelectedShellChanged: (shell: Shell) => void

  readonly mergeTool: IMergeTool | null
  readonly onMergeToolNameChanged: (name: string) => void
  readonly onMergeToolCommandChanged: (command: string) => void
}

interface IIntegrationsPreferencesState {
  readonly selectedExternalEditor: ExternalEditor | null
  readonly selectedShell: Shell
}

export class Integrations extends React.Component<
  IIntegrationsPreferencesProps,
  IIntegrationsPreferencesState
> {
  public constructor(props: IIntegrationsPreferencesProps) {
    super(props)

    this.state = {
      selectedExternalEditor: this.props.selectedExternalEditor,
      selectedShell: this.props.selectedShell,
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
    const value = parseEditor(event.currentTarget.value)
    if (value) {
      this.setState({ selectedExternalEditor: value })
      this.props.onSelectedEditorChanged(value)
    }
  }

  private onSelectedShellChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = parseShell(event.currentTarget.value)
    this.setState({ selectedShell: value })
    this.props.onSelectedShellChanged(value)
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
            <LinkButton uri="https://atom.io/">Install Atom?</LinkButton>
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

  private renderMergeTool() {
    if (!enableMergeTool()) {
      return null
    }

    const mergeTool = this.props.mergeTool

    return (
      <div className="brutalism">
        <strong>{__DARWIN__ ? 'Merge Tool' : 'Merge tool'}</strong>

        <Row>
          <TextBox
            placeholder="Name"
            value={mergeTool ? mergeTool.name : ''}
            onValueChanged={this.props.onMergeToolNameChanged}
          />
        </Row>

        <Row>
          <TextBox
            placeholder="Command"
            value={mergeTool && mergeTool.command ? mergeTool.command : ''}
            onValueChanged={this.props.onMergeToolCommandChanged}
          />
        </Row>
      </div>
    )
  }

  public render() {
    return (
      <DialogContent>
        <h2>Applications</h2>
        <Row>{this.renderExternalEditor()}</Row>
        <Row>{this.renderSelectedShell()}</Row>
        {this.renderMergeTool()}
      </DialogContent>
    )
  }
}
