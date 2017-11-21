import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'
import { Select } from '../lib/select'
import { ExternalEditor, parse as parseEditor } from '../../lib/editors'
import { Shell, parse as parseShell } from '../../lib/shells'
import { TextBox } from '../lib/text-box'
import { enableMergeTool } from '../../lib/feature-flag'
import { IMergeTool } from '../../lib/git/config'

interface IAdvancedPreferencesProps {
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly availableEditors: ReadonlyArray<ExternalEditor>
  readonly selectedExternalEditor?: ExternalEditor
  readonly availableShells: ReadonlyArray<Shell>
  readonly selectedShell: Shell
  readonly onOptOutofReportingchanged: (checked: boolean) => void
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onSelectedEditorChanged: (editor: ExternalEditor) => void
  readonly onSelectedShellChanged: (shell: Shell) => void

  readonly mergeTool: IMergeTool | null
  readonly onMergeToolNameChanged: (name: string) => void
  readonly onMergeToolCommandChanged: (command: string) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly selectedExternalEditor?: ExternalEditor
  readonly selectedShell: Shell
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      selectedExternalEditor: this.props.selectedExternalEditor,
      selectedShell: this.props.selectedShell,
    }
  }

  public async componentWillReceiveProps(nextProps: IAdvancedPreferencesProps) {
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

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingchanged(value)
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
    this.props.onConfirmDiscardChangesChanged(value)
  }

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
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

  public reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting{' '}
        <LinkButton uri={SamplesURL}>anonymous usage data</LinkButton>
      </span>
    )
  }

  private renderExternalEditor() {
    const options = this.props.availableEditors
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
        value={this.state.selectedExternalEditor}
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
        <Row>{this.renderExternalEditor()}</Row>
        <Row>{this.renderSelectedShell()}</Row>
        {this.renderMergeTool()}
        <Row>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.optOutOfUsageTracking
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Show confirmation dialog before removing repositories"
            value={
              this.state.confirmRepositoryRemoval
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmRepositoryRemovalChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Show confirmation dialog before discarding changes"
            value={
              this.state.confirmDiscardChanges
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmDiscardChangesChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
