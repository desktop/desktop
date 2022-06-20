import * as React from 'react'
import { DialogContent } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { Select } from '../lib/select'
import { Shell, parse as parseShell } from '../../lib/shells'
import {
  CustomEditorRepoEntityPathValue,
  FoundEditor,
  suggestedExternalEditor,
} from '../../lib/editors/shared'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IIntegrationsPreferencesProps {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedExternalEditor: string | null
  readonly customExternalEditor: FoundEditor | null
  readonly useExternalCustomEditor: boolean
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly onuseExternalCustomEditorChange: (value: boolean) => void
  readonly onOpenEditorPickerDialog: () => void
  readonly onSelectedEditorChanged: (editor: string) => void
  readonly onArgsChanged: (args: string) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
}

interface IIntegrationsPreferencesState {
  readonly selectedExternalEditor: string | null
  readonly selectedShell: Shell
  readonly customExternalEditor: FoundEditor | null
  readonly useExternalCustomEditor: boolean
  readonly hasSuggestedArgument: boolean
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
      customExternalEditor: this.props.customExternalEditor,
      useExternalCustomEditor: this.props.useExternalCustomEditor,
      hasSuggestedArgument: true,
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
      useExternalCustomEditor: nextProps.useExternalCustomEditor,
      customExternalEditor: nextProps.customExternalEditor,
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

  private onuseExternalCustomEditorChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked
    this.setState({ useExternalCustomEditor: value })
    this.props.onuseExternalCustomEditorChange(value)
  }

  private onLaunchArgumentsChanged = (value: string) => {
    this.setState({
      hasSuggestedArgument: value.includes(CustomEditorRepoEntityPathValue),
    })

    this.props.onArgsChanged(value)
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
    const label = 'External Editor'

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
        disabled={this.state.useExternalCustomEditor}
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

  private renderCustomEditorCheckbox() {
    return (
      <Checkbox
        label="Use external editor of your choise"
        value={
          this.state.useExternalCustomEditor
            ? CheckboxValue.On
            : CheckboxValue.Off
        }
        onChange={this.onuseExternalCustomEditorChanged}
      />
    )
  }

  private renderCustomEditorPicker() {
    if (!this.state.useExternalCustomEditor) {
      return
    }

    const customEditor = this.state.customExternalEditor

    return (
      <>
        <TextBox
          value={customEditor?.path ?? ''}
          label={
            __DARWIN__ ? 'Custom External Editor' : 'Custom external editor'
          }
          placeholder="path to custom external editor"
          disabled={true}
        />
        <Button
          onClick={this.props.onOpenEditorPickerDialog}
          disabled={!this.state.useExternalCustomEditor}
        >
          Choose…
        </Button>
      </>
    )
  }

  private renderCustomEditorLaunchArgs() {
    if (!this.state.useExternalCustomEditor) {
      return
    }

    const customEditor = this.state.customExternalEditor

    return (
      <TextBox
        label="Launch arguments"
        type="text"
        value={customEditor?.launchArgs ?? CustomEditorRepoEntityPathValue}
        disabled={customEditor === null}
        onValueChanged={this.onLaunchArgumentsChanged}
      />
    )
  }

  private renderSuggestedArgWarning() {
    if (
      this.state.hasSuggestedArgument ||
      this.state.customExternalEditor === null
    ) {
      return
    }

    return (
      <p className="git-settings-description">
        <span className="warning-icon">⚠️</span>{' '}
        {CustomEditorRepoEntityPathValue} - reference to the current repository
        folder path or a file path.
      </p>
    )
  }

  public render() {
    return (
      <DialogContent>
        <h2>Applications</h2>
        <Row>{this.renderExternalEditor()}</Row>
        <Row>{this.renderSelectedShell()}</Row>
        <Row>{this.renderCustomEditorCheckbox()}</Row>
        <Row>{this.renderCustomEditorPicker()}</Row>
        <Row>{this.renderCustomEditorLaunchArgs()}</Row>
        {this.renderSuggestedArgWarning()}
      </DialogContent>
    )
  }
}
