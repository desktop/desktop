import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { showOpenDialog } from '../main-process-proxy'
import { access, stat } from 'fs/promises'
import * as fs from 'fs'
import { InputError } from '../lib/input-description/input-error'
import { IAccessibleMessage } from '../../models/accessible-message'

// Shells
// - macOS: path/bundleId + params
// - Windows: path + params
// - Linux: path + params

// Editors
// - macOS: path/bundleId + params
// - Windows: path + params + usesShell (if path ends with .cmd)
// - Linux: path + params

interface ICustomIntegrationFormProps {
  readonly path: string
  readonly params: string
  readonly onPathChanged: (path: string) => void
  readonly onParamsChanged: (params: string) => void
}

interface ICustomIntegrationFormState {
  readonly path: string
  readonly params: string
  readonly isValidPath: boolean
  readonly showNonValidPathWarning: boolean
}

export class CustomIntegrationForm extends React.Component<
  ICustomIntegrationFormProps,
  ICustomIntegrationFormState
> {
  public constructor(props: ICustomIntegrationFormProps) {
    super(props)

    this.state = {
      path: props.path,
      params: props.params,
      isValidPath: false,
      showNonValidPathWarning: false,
    }
  }

  public render() {
    return (
      <div className="custom-integration-form-container">
        <div className="custom-integration-form-path-container">
          <TextBox
            value={this.state.path}
            onValueChanged={this.onPathChanged}
            placeholder="Path to executable"
          />
          <Button onClick={this.onChoosePath}>Choose…</Button>
        </div>
        {this.renderErrors()}
        <TextBox
          value={this.state.params}
          onValueChanged={this.onParamsChanged}
          placeholder="Command line arguments"
        />
      </div>
    )
  }

  private renderErrors() {
    if (
      !this.state.path.length ||
      this.state.isValidPath ||
      !this.state.showNonValidPathWarning
    ) {
      return null
    }

    const errorDescription =
      'This directory does not appear to be a valid executable.'

    const msg: IAccessibleMessage = {
      screenReaderMessage: errorDescription,
      displayedMessage: errorDescription,
    }

    return (
      <div className="custom-integration-form-error">
        <InputError
          id="add-existing-repository-path-error"
          trackedUserInput={this.state.path}
          ariaLiveMessage={msg.screenReaderMessage}
        >
          {msg.displayedMessage}
        </InputError>
      </div>
    )
  }

  private onChoosePath = async () => {
    const path = await showOpenDialog({
      properties: __DARWIN__ ? ['openFile', 'openDirectory'] : ['openFile'],
    })

    if (path === null) {
      return
    }

    this.updatePath(path)
  }

  private async updatePath(path: string) {
    this.setState({ path, isValidPath: false })
    await this.validatePath(path)
  }

  private async validatePath(path: string) {
    if (path.length === 0) {
      this.setState({
        isValidPath: false,
      })
      return
    }

    try {
      const pathStat = await stat(path)
      const canBeExecuted = await access(path, fs.constants.X_OK)
        .then(() => true)
        .catch(() => false)
      this.setState({
        isValidPath: pathStat.isFile() && canBeExecuted,
      })
    } catch (e) {
      this.setState({
        isValidPath: false,
      })
    }

    this.props.onPathChanged(path)
  }

  private onPathChanged = (path: string) => {
    this.updatePath(path)
  }

  private onParamsChanged = (params: string) => {
    this.setState({ params })
    this.props.onParamsChanged(params)
  }
}
