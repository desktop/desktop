import * as React from 'react'
import { Repository } from '../../models/repository'
import {
  ICustomIntegration,
  TargetPathArgument,
} from '../../lib/custom-integration'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { CustomIntegrationForm } from '../preferences/custom-integration-form'
import { enableCustomIntegration } from '../../lib/feature-flag'

interface IEditorSettingsProps {
  readonly repository: Repository
  readonly availableEditors: ReadonlyArray<string>
  readonly globalEditor: string | null
  readonly onPreferenceChanged: (
    editor: string | null,
    customEditor: ICustomIntegration | null
  ) => void
}

interface IEditorSettingsState {
  readonly selectedEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration
}

const UseGlobalValue = '__USE_GLOBAL__'
const CustomEditorValue = '__CUSTOM__'

export class EditorSettings extends React.Component<
  IEditorSettingsProps,
  IEditorSettingsState
> {
  public constructor(props: IEditorSettingsProps) {
    super(props)

    const { repository } = props

    this.state = {
      selectedEditor: repository.preferredExternalEditor,
      useCustomEditor: repository.preferredCustomEditor !== null,
      customEditor: repository.preferredCustomEditor ?? {
        path: '',
        arguments: TargetPathArgument,
      },
    }
  }

  private onEditorChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value

    if (value === UseGlobalValue) {
      this.setState({
        selectedEditor: null,
        useCustomEditor: false,
      })
      this.props.onPreferenceChanged(null, null)
    } else if (value === CustomEditorValue) {
      this.setState({
        selectedEditor: null,
        useCustomEditor: true,
      })
    } else {
      this.setState({
        selectedEditor: value,
        useCustomEditor: false,
      })
      this.props.onPreferenceChanged(value, null)
    }
  }

  private onCustomEditorPathChanged = (path: string, bundleID?: string) => {
    const customEditor: ICustomIntegration = {
      path,
      arguments: this.state.customEditor.arguments,
      bundleID,
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

  private onSaveCustomEditor = () => {
    if (this.state.customEditor.path) {
      this.props.onPreferenceChanged(null, this.state.customEditor)
    }
  }

  private getCurrentSelectValue(): string {
    const { useCustomEditor, selectedEditor } = this.state

    if (useCustomEditor) {
      return CustomEditorValue
    }

    if (selectedEditor !== null) {
      return selectedEditor
    }

    return UseGlobalValue
  }

  public render() {
    const { availableEditors, globalEditor } = this.props
    const { useCustomEditor, customEditor } = this.state
    const showCustomForm = useCustomEditor && enableCustomIntegration()

    return (
      <DialogContent>
        <div className="advanced-section">
          <h2 id="editor-settings-heading">External Editor</h2>
          <p>
            Choose the editor to use when opening this repository. This
            overrides your global editor preference.
          </p>
          <Row>
            <Select
              label="Editor for this repository"
              value={this.getCurrentSelectValue()}
              onChange={this.onEditorChanged}
            >
              <option value={UseGlobalValue}>
                Use global default{globalEditor ? ` (${globalEditor})` : ''}
              </option>
              <optgroup label="Available Editors">
                {availableEditors.map(editor => (
                  <option key={editor} value={editor}>
                    {editor}
                  </option>
                ))}
              </optgroup>
              {enableCustomIntegration() && (
                <option value={CustomEditorValue}>
                  {__DARWIN__
                    ? 'Configure Custom Editor...'
                    : 'Configure custom editor...'}
                </option>
              )}
            </Select>
          </Row>

          {showCustomForm && (
            <>
              <CustomIntegrationForm
                id="repo-editor-settings"
                path={customEditor.path}
                arguments={customEditor.arguments}
                onPathChanged={this.onCustomEditorPathChanged}
                onArgumentsChanged={this.onCustomEditorArgumentsChanged}
              />
              <Row>
                <Button
                  onClick={this.onSaveCustomEditor}
                  disabled={!customEditor.path}
                >
                  Save Custom Editor
                </Button>
              </Row>
            </>
          )}
        </div>
      </DialogContent>
    )
  }
}
