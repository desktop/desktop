import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { showOpenDialog } from '../main-process-proxy'
import { InputError } from '../lib/input-description/input-error'
import {
  checkTargetPathArgument,
  validateCustomIntegrationPath,
  parseCustomIntegrationArguments,
  TargetPathArgument,
} from '../../lib/custom-integration'

interface ICustomIntegrationFormProps {
  /** ID used to prefix the IDs of some child elements */
  readonly id: string
  readonly path: string
  readonly arguments: string
  readonly onPathChanged: (path: string, bundleID?: string) => void
  readonly onArgumentsChanged: (args: string) => void
}

interface ICustomIntegrationFormState {
  readonly path: string
  readonly arguments: string
  /** Whether or not the current path is valid */
  readonly isValidPath: boolean
  /** Whether or not to show a warning for an invalid path */
  readonly showNonValidPathWarning: boolean
  /** Whether or not the current arguments are valid */
  readonly isValidArgs: boolean
  /** Whether or not to show an error for invalid arguments */
  readonly showNonValidArgsError: boolean
  /**
   * Whether or not to show an error for missing target path placeholder among
   * the arguments.
   */
  readonly showNoRepoPathArgError: boolean
}

/** A form for configuring a custom integration, with a path and arguments. */
export class CustomIntegrationForm extends React.Component<
  ICustomIntegrationFormProps,
  ICustomIntegrationFormState
> {
  private pathInputRef = React.createRef<TextBox>()

  public constructor(props: ICustomIntegrationFormProps) {
    super(props)

    this.state = {
      path: props.path,
      arguments: props.arguments,
      isValidPath: false,
      showNonValidPathWarning: false,
      isValidArgs: false,
      showNonValidArgsError: false,
      showNoRepoPathArgError: false,
    }
  }

  /** Focuses the path text box. */
  public focus() {
    this.pathInputRef.current?.focus()
  }

  public render() {
    return (
      <div className="custom-integration-form-container">
        <div className="custom-integration-form-path-container">
          <TextBox
            label="Path"
            value={this.state.path}
            ref={this.pathInputRef}
            onValueChanged={this.onPathChanged}
            placeholder="Path to executable"
            ariaDescribedBy={`${this.props.id}-custom-integration-path-error`}
          />
          <Button onClick={this.onChoosePath}>Choose…</Button>
        </div>
        {this.renderPathErrors()}
        <TextBox
          label="Arguments"
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
    if (this.state.isValidPath || !this.state.showNonValidPathWarning) {
      return null
    }

    const errorDescription =
      'This path does not appear to be a valid executable.'

    return (
      <div className="custom-integration-form-error">
        <InputError
          id={`${this.props.id}-custom-integration-path-error`}
          trackedUserInput={this.state.path}
          ariaLiveMessage={errorDescription}
        >
          {errorDescription}
        </InputError>
      </div>
    )
  }

  private renderArgsErrors() {
    if (
      this.state.isValidArgs ||
      (!this.state.showNoRepoPathArgError && !this.state.showNonValidArgsError)
    ) {
      return null
    }

    const errorDescription = this.state.showNonValidArgsError
      ? 'These arguments are not valid.'
      : `Arguments must include the target path placeholder (${TargetPathArgument}).`

    return (
      <div className="custom-integration-form-error">
        <InputError
          id={`${this.props.id}-custom-integration-args-error`}
          trackedUserInput={this.state.path}
          ariaLiveMessage={errorDescription}
        >
          {errorDescription}
        </InputError>
      </div>
    )
  }

  private onChoosePath = async () => {
    // On macOS we also want to allow selecting directories, since apps on macOS
    // are usually directories (e.g. apps on /Applications).
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

    const result = await validateCustomIntegrationPath(path)

    this.setState({
      isValidPath: result.isValid,
      showNonValidPathWarning: !result.isValid,
    })

    if (result.isValid) {
      this.props.onPathChanged(path, result.bundleID)
    }
  }

  private onPathChanged = (path: string) => {
    this.updatePath(path)
  }

  private updateArguments(args: string) {
    try {
      const argv = parseCustomIntegrationArguments(args)

      if (!checkTargetPathArgument(argv)) {
        this.setState({
          arguments: args,
          isValidArgs: false,
          showNonValidArgsError: false,
          showNoRepoPathArgError: true,
        })
        return
      }

      this.setState({
        arguments: args,
        isValidArgs: true,
        showNonValidArgsError: false,
        showNoRepoPathArgError: false,
      })

      this.props.onArgumentsChanged(args)
    } catch (e) {
      log.error('Failed to parse custom integration arguments:', e)

      this.setState({
        arguments: args,
        isValidArgs: false,
        showNonValidArgsError: true,
        showNoRepoPathArgError: false,
      })
    }
  }

  private onParamsChanged = (params: string) => {
    this.updateArguments(params)
  }
}
