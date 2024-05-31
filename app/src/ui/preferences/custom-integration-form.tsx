import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'

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
        <TextBox
          value={this.state.params}
          onValueChanged={this.onParamsChanged}
          placeholder="Command line arguments"
        />
      </div>
    )
  }

  private onChoosePath = () => {
    // do nothing
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
    this.props.onPathChanged(path)
  }

  private onParamsChanged = (params: string) => {
    this.setState({ params })
    this.props.onParamsChanged(params)
  }
}
