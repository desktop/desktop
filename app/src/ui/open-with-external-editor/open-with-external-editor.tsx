import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { CustomIntegrationForm } from '../preferences/custom-integration-form'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  ICustomIntegration,
  TargetPathArgument,
} from '../../lib/custom-integration'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { enableCustomIntegration } from '../../lib/feature-flag'

const CustomIntegrationValue = 'other'

interface IOpenWithExternalEditorProps {
  readonly onDismissed: () => void
  readonly onOpenWithEditor: (
    editor: string | null,
    customEditor: ICustomIntegration | null
  ) => Promise<void>
  /** Callback to save the editor preference for the repository. Only provided when opened from a repository context. */
  readonly onSavePreference?: (
    editor: string | null,
    customEditor: ICustomIntegration | null
  ) => Promise<void>
  /** The name of the repository (for display in checkbox label). */
  readonly repositoryName?: string
}

interface IOpenWithExternalEditorState {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
  readonly rememberChoice: boolean
}

export class OpenWithExternalEditor extends React.Component<
  IOpenWithExternalEditorProps,
  IOpenWithExternalEditorState
> {
  public constructor(props: IOpenWithExternalEditorProps) {
    super(props)

    this.state = {
      availableEditors: [],
      selectedEditor: null,
      useCustomEditor: false,
      customEditor: { path: '', arguments: TargetPathArgument },
      rememberChoice: false,
    }
  }

  public async componentDidMount() {
    const editors = await getAvailableEditors()
    const availableEditors = editors.map(e => e.editor)
    const selectedEditor =
      availableEditors.length > 0 ? availableEditors[0] : null
    const allowCustomIntegration = enableCustomIntegration()

    this.setState({
      availableEditors,
      selectedEditor,
      useCustomEditor: availableEditors.length === 0 && allowCustomIntegration,
    })
  }

  private onSelectedEditorChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    if (value === CustomIntegrationValue) {
      this.setState({ useCustomEditor: true, selectedEditor: null })
    } else {
      this.setState({ useCustomEditor: false, selectedEditor: value })
    }
  }

  private onCustomEditorPathChanged = (path: string, bundleID?: string) => {
    const customEditor: ICustomIntegration = {
      path,
      bundleID,
      arguments: this.state.customEditor.arguments ?? TargetPathArgument,
    }
    this.setState({ customEditor })
  }

  private onCustomEditorArgumentsChanged = (args: string) => {
    const customEditor: ICustomIntegration = {
      ...this.state.customEditor,
      arguments: args,
    }
    this.setState({ customEditor })
  }

  private onRememberChoiceChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ rememberChoice: event.currentTarget.checked })
  }

  private onSubmit = async () => {
    const { useCustomEditor, selectedEditor, customEditor, rememberChoice } =
      this.state

    const editorToUse = useCustomEditor ? null : selectedEditor
    const customEditorToUse = useCustomEditor ? customEditor : null

    if (useCustomEditor && !customEditor.path) {
      return
    }

    if (rememberChoice && this.props.onSavePreference) {
      await this.props.onSavePreference(editorToUse, customEditorToUse)
    }

    await this.props.onOpenWithEditor(editorToUse, customEditorToUse)
    this.props.onDismissed()
  }

  private renderEditorSelect() {
    const options = this.state.availableEditors

    return (
      <Select
        label="Select an editor"
        value={
          this.state.useCustomEditor
            ? CustomIntegrationValue
            : this.state.selectedEditor ?? undefined
        }
        onChange={this.onSelectedEditorChanged}
      >
        {options.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {enableCustomIntegration() && (
          <option key={CustomIntegrationValue} value={CustomIntegrationValue}>
            {__DARWIN__
              ? 'Configure Custom Editor…'
              : 'Configure custom editor…'}
          </option>
        )}
      </Select>
    )
  }

  private renderCustomEditor() {
    if (!this.state.useCustomEditor || !enableCustomIntegration()) {
      return null
    }

    return (
      <Row>
        <CustomIntegrationForm
          id="custom-editor-open-with"
          path={this.state.customEditor.path ?? ''}
          arguments={this.state.customEditor.arguments}
          onPathChanged={this.onCustomEditorPathChanged}
          onArgumentsChanged={this.onCustomEditorArgumentsChanged}
        />
      </Row>
    )
  }

  public render() {
    const title = __DARWIN__ ? 'Open With…' : 'Open with…'
    const disabled =
      (!this.state.useCustomEditor && this.state.selectedEditor === null) ||
      (this.state.useCustomEditor && !this.state.customEditor.path)

    return (
      <Dialog
        id="open-with-external-editor"
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <Row>{this.renderEditorSelect()}</Row>
          {this.renderCustomEditor()}
          {this.props.onSavePreference && this.props.repositoryName && (
            <Row>
              <Checkbox
                label={`Remember this choice for ${this.props.repositoryName}`}
                value={
                  this.state.rememberChoice
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={this.onRememberChoiceChanged}
              />
            </Row>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Open"
            okButtonDisabled={disabled}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
