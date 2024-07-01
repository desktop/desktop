import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { showOpenDialog } from '../main-process-proxy'
import { access, stat } from 'fs/promises'
import * as fs from 'fs'
import { InputError } from '../lib/input-description/input-error'
import { IAccessibleMessage } from '../../models/accessible-message'
import { promisify } from 'util'
import { exec } from 'child_process'
import { ICustomIntegration } from '../../lib/custom-integration'

const execAsync = promisify(exec)

interface ICustomIntegrationFormProps {
  readonly id: string
  readonly path: string
  readonly arguments: string
  readonly onChange: (customIntegration: ICustomIntegration) => void
}

interface ICustomIntegrationFormState {
  readonly path: string
  readonly arguments: string
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
      arguments: props.arguments,
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
            ariaDescribedBy={`${this.props.id}-custom-integration-path-error`}
          />
          <Button onClick={this.onChoosePath}>Choose…</Button>
        </div>
        {this.renderErrors()}
        <TextBox
          value={this.state.arguments}
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
          id={`${this.props.id}-custom-integration-path-error`}
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
        showNonValidPathWarning: true,
      })
      return
    }

    try {
      const pathStat = await stat(path)
      const canBeExecuted = await access(path, fs.constants.X_OK)
        .then(() => true)
        .catch(() => false)

      const isExecutableFile = pathStat.isFile() && canBeExecuted

      // On macOS, not only executable files are valid, but also apps (which are
      // directories with a `.app` extension and from which we can retrieve
      // the app bundle ID)
      let bundleId = null
      if (__DARWIN__ && !isExecutableFile && pathStat.isDirectory()) {
        bundleId = await this.getBundleId(path)
      }

      const isValidPath = isExecutableFile || !!bundleId

      this.setState({
        isValidPath,
        showNonValidPathWarning: true,
      })
    } catch (e) {
      this.setState({
        isValidPath: false,
        showNonValidPathWarning: true,
      })
    }

    this.props.onChange({
      path,
      args: this.state.arguments.split(' '), // TODO: use proper parser
    })
  }

  private onPathChanged = (path: string) => {
    this.updatePath(path)
  }

  // Function to retrieve, on macOS, the bundleId of an app given its path
  private getBundleId = async (path: string) => {
    try {
      // Ensure the path ends with `.app` for applications
      if (!path.endsWith('.app')) {
        throw new Error(
          'The provided path does not point to a macOS application.'
        )
      }

      // Use mdls to query the kMDItemCFBundleIdentifier attribute
      const { stdout } = await execAsync(
        `mdls -name kMDItemCFBundleIdentifier -raw "${path}"`
      )
      const bundleId = stdout.trim()

      // Check for valid output
      if (!bundleId || bundleId === '(null)') {
        return null
      }

      return bundleId
    } catch (error) {
      console.error('Failed to retrieve bundle ID:', error)
      return null
    }
  }

  private onParamsChanged = (params: string) => {
    this.setState({ arguments: params })
    this.props.onChange({
      path: this.state.path,
      args: params.split(' '), // TODO: use proper parser
    })
  }
}
