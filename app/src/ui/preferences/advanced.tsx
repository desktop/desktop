import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'
import { Select } from '../lib/select'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { ExternalEditor, parse as parseEditor } from '../../models/editors'
import {
  Shell,
  parse as parseShell,
  getAvailableShells,
} from '../../lib/shells'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean
  readonly confirmRepoRemoval: boolean
  readonly selectedExternalEditor: ExternalEditor
  readonly selectedShell: Shell
  readonly onOptOutSet: (checked: boolean) => void
  readonly onConfirmRepoRemovalSet: (checked: boolean) => void
  readonly onSelectedEditorChanged: (editor: ExternalEditor) => void
  readonly onSelectedShellChanged: (shell: Shell) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
  readonly availableEditors?: ReadonlyArray<ExternalEditor>
  readonly availableShells?: ReadonlyArray<Shell>
  readonly selectedExternalEditor: ExternalEditor
  readonly selectedShell: Shell
  readonly confirmRepoRemoval: boolean
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: this.props.isOptedOut,
      confirmRepoRemoval: this.props.confirmRepoRemoval,
      selectedExternalEditor: this.props.selectedExternalEditor,
      selectedShell: this.props.selectedShell,
    }
  }

  public async componentDidMount() {
    const [availableEditors, availableShells] = await Promise.all([
      getAvailableEditors(),
      getAvailableShells(),
    ])

    const editors = availableEditors.map(editor => editor.editor)
    let selectedExternalEditor = this.props.selectedExternalEditor
    if (editors.length) {
      const indexOf = editors.indexOf(selectedExternalEditor)
      if (indexOf === -1) {
        // if the editor cannot be found, select the first entry
        // so that the user can immediately save changes
        selectedExternalEditor = editors[0]
        this.props.onSelectedEditorChanged(selectedExternalEditor)
      }
    }

    const shells = availableShells.map(s => s.shell)
    let selectedShell = this.props.selectedShell
    if (availableShells.length) {
      const indexOf = shells.indexOf(selectedShell)
      if (indexOf === -1) {
        selectedShell = shells[0]
        this.props.onSelectedShellChanged(selectedShell)
      }
    }

    this.setState({
      availableEditors: editors,
      selectedExternalEditor,
      availableShells: shells,
      selectedShell,
    })
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ reportingOptOut: value })
    this.props.onOptOutSet(value)
  }

  private onConfirmRepoRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepoRemoval: value })
    this.props.onConfirmRepoRemovalSet(value)
  }

  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = parseEditor(event.currentTarget.value)
    this.setState({ selectedExternalEditor: value })
    this.props.onSelectedEditorChanged(value)
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
    const options = this.state.availableEditors || []
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
    const options = this.state.availableShells || []

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

  public render() {
    return (
      <DialogContent>
        <Row>{this.renderExternalEditor()}</Row>
        <Row>{this.renderSelectedShell()}</Row>
        <Row>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Show confirmation dialog before removing repositories"
            value={
              this.state.confirmRepoRemoval ? (
                CheckboxValue.On
              ) : (
                CheckboxValue.Off
              )
            }
            onChange={this.onConfirmRepoRemovalChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
