import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'
import { Select } from '../lib/select'
import { getAvailableEditors } from '../../lib/editors/lookup'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean
  readonly confirmRepoRemoval: boolean
  readonly selectedExternalEditor: string
  readonly onOptOutSet: (checked: boolean) => void
  readonly onConfirmRepoRemovalSet: (checked: boolean) => void
  readonly onSelectedEditorChanged: (editor: string) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
  readonly availableEditors?: ReadonlyArray<string>
  readonly selectedExternalEditor?: string
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
    }
  }

  public async componentDidMount() {
    const availableEditors = await getAvailableEditors()
    const editorLabels = availableEditors.map(editor => editor.name)
    this.setState({ availableEditors: editorLabels })
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
    const value = event.currentTarget.value
    this.setState({ selectedExternalEditor: value })
    this.props.onSelectedEditorChanged(value)
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
        <div className="select-component">
          <label>
            {label}
          </label>
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
        {options.map(n =>
          <option key={n} value={n}>
            {n}
          </option>
        )}
      </Select>
    )
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          {this.renderExternalEditor()}
        </Row>
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
              this.state.confirmRepoRemoval
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmRepoRemovalChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
