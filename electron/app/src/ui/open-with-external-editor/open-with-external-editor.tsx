import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { Select } from '../lib/select'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { CustomIntegrationForm } from '../preferences/custom-integration-form'
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
}

interface IOpenWithExternalEditorState {
  readonly availableEditors: ReadonlyArray<string>
  readonly selectedEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
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

  private onSubmit = async () => {
    const { useCustomEditor, selectedEditor, customEditor } = this.state

    if (useCustomEditor) {
      if (!customEditor.path) {
        return
      }
      await this.props.onOpenWithEditor(null, customEditor)
    } else {
      await this.props.onOpenWithEditor(selectedEditor, null)
    }
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
