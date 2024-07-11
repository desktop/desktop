import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { showOpenDialog } from '../main-process-proxy'
import { access, stat } from 'fs/promises'
import * as fs from 'fs'
import { InputError } from '../lib/input-description/input-error'
import { IAccessibleMessage } from '../../models/accessible-message'
import {
  getBundleID as getAppBundleID,
  parseCustomIntegrationArguments,
  RepoPathArgument,
} from '../../lib/custom-integration'

interface ICustomIntegrationFormProps {
  readonly id: string
  readonly path: string
  readonly arguments: string
  readonly onPathChanged: (path: string, bundleID?: string) => void
  readonly onArgumentsChanged: (args: ReadonlyArray<string>) => void
}

interface ICustomIntegrationFormState {
  readonly path: string
  readonly arguments: string
  readonly isValidPath: boolean
  readonly showNonValidPathWarning: boolean
  readonly isValidArgs: boolean
  readonly showNonValidArgsWarning: boolean
}

export class CustomIntegrationForm extends React.Component<
  ICustomIntegrationFormProps,
  ICustomIntegrationFormState
> {
  public constructor(props: ICustomIntegrationFormProps) {
    super(props)

    this.state = {
      path: props.path,
      arguments: props.arguments || RepoPathArgument,
      isValidPath: false,
      showNonValidPathWarning: false,
      isValidArgs: false,
      showNonValidArgsWarning: false,
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
        {this.renderPathErrors()}
        <TextBox
          value={this.state.arguments}
          onValueChanged={this.onParamsChanged}
          placeholder="Command line arguments"
          ariaDescribedBy={`${this.props.id}-custom-integration-args-error`}
        />
        {this.renderArgsErrors()}
      </div>
    )
  }

  private renderPathErrors() {
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

  private renderArgsErrors() {
    if (
      !this.state.arguments.length ||
      this.state.isValidArgs ||
      !this.state.showNonValidArgsWarning
    ) {
      return null
    }

    const errorDescription = 'These arguments are not valid.'

    const msg: IAccessibleMessage = {
      screenReaderMessage: errorDescription,
      displayedMessage: errorDescription,
    }

    return (
      <div className="custom-integration-form-error">
        <InputError
          id={`${this.props.id}-custom-integration-args-error`}
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

    let bundleID = undefined

    try {
      const pathStat = await stat(path)
      const canBeExecuted = await access(path, fs.constants.X_OK)
        .then(() => true)
        .catch(() => false)

      const isExecutableFile = pathStat.isFile() && canBeExecuted

      // On macOS, not only executable files are valid, but also apps (which are
      // directories with a `.app` extension and from which we can retrieve
      // the app bundle ID)
      if (__DARWIN__ && !isExecutableFile && pathStat.isDirectory()) {
        bundleID = await getAppBundleID(path)
      }

      const isValidPath = isExecutableFile || !!bundleID

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

    this.props.onPathChanged(path, bundleID)
  }

  private onPathChanged = (path: string) => {
    this.updatePath(path)
  }

  private updateArguments(args: string) {
    this.setState({ arguments: args })
    try {
      const argv = parseCustomIntegrationArguments(this.state.arguments)

      this.setState({
        arguments: args,
        isValidArgs: true,
        showNonValidArgsWarning: true,
      })

      this.props.onArgumentsChanged(argv)
    } catch (e) {
      log.error('Failed to parse custom integration arguments:', e)

      this.setState({
        arguments: args,
        isValidArgs: false,
        showNonValidArgsWarning: true,
      })
    }
  }

  private onParamsChanged = (params: string) => {
    this.updateArguments(params)
  }
}
