import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { Select } from '../lib/select'
import { Shell, parse as parseShell } from '../../lib/shells'
import { suggestedExternalEditor } from '../../lib/editors/shared'
import { CustomIntegrationForm } from './custom-integration-form'
import { ICustomIntegration } from '../../lib/custom-integration'

interface IIntegrationsPreferencesProps {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedExternalEditor: string | null
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly customEditor: ICustomIntegration | null
  readonly customShell: ICustomIntegration | null
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
  readonly onCustomEditorChanged: (customEditor: ICustomIntegration) => void
  readonly onCustomShellChanged: (customShell: ICustomIntegration) => void
}

interface IIntegrationsPreferencesState {
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly customEditor: ICustomIntegration | null
  readonly customShell: ICustomIntegration | null
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
      customEditor: this.props.customEditor,
      customShell: this.props.customShell,
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

  private renderCustomExternalEditor() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-editor"
          path={this.state.customEditor?.path ?? ''}
          arguments={this.state.customEditor?.arguments.join(' ') ?? ''}
          onChange={this.onCustomEditorChanged}
        />
      </Row>
    )
  }

  private onCustomEditorChanged = (customEditor: ICustomIntegration) => {
    this.setState({ customEditor })
    this.props.onCustomEditorChanged(customEditor)
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

  private renderCustomShell() {
    return (
      <Row>
        <CustomIntegrationForm
          id="custom-shell"
          path={this.state.customShell?.path ?? ''}
          arguments={this.state.customShell?.arguments.join(' ') ?? ''}
          onChange={this.onCustomShellChanged}
        />
      </Row>
    )
  }

  private onCustomShellChanged = (customShell: ICustomIntegration) => {
    this.setState({ customShell })
    this.props.onCustomShellChanged(customShell)
  }

  public render() {
    return (
      <DialogContent>
        <h2>Applications</h2>
        <Row>{this.renderExternalEditor()}</Row>
        {this.renderCustomExternalEditor()}
        <Row>{this.renderSelectedShell()}</Row>
        {this.renderCustomShell()}
      </DialogContent>
    )
  }
}
