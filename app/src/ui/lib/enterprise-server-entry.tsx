import * as React from 'react'
import { Loading } from './loading'
import { Form } from './form'
import { TextBox } from './text-box'
import { Button } from './button'
import { Errors } from './errors'

interface IEnterpriseServerEntryProps {
  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * A value indicating whether or not the sign in store is
   * busy processing a request. While this value is true all
   * form inputs and actions save for a cancel action will
   * be disabled.
   */
  readonly loading: boolean

  /**
   * A callback which is invoked once the user has entered an
   * endpoint url and submitted it either by clicking on the submit
   * button or by submitting the form through other means (ie hitting Enter).
   */
  readonly onSubmit: (url: string) => void

  /** An array of additional buttons to render after the "Continue" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface IEnterpriseServerEntryState {
  readonly serverAddress: string
}

/** An entry form for an Enterprise address. */
export class EnterpriseServerEntry extends React.Component<
  IEnterpriseServerEntryProps,
  IEnterpriseServerEntryState
> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)
    this.state = { serverAddress: '' }
  }

  public render() {
    const disableEntry = this.props.loading
    const disableSubmission =
      this.state.serverAddress.length === 0 || this.props.loading

    return (
      <Form onSubmit={this.onSubmit}>
        <TextBox
          label="Enterprise or AE address"
          autoFocus={true}
          disabled={disableEntry}
          onValueChanged={this.onServerAddressChanged}
          placeholder="https://github.example.com"
        />

        {this.props.error ? <Errors>{this.props.error.message}</Errors> : null}

        <div className="actions">
          <Button type="submit" disabled={disableSubmission}>
            {this.props.loading ? <Loading /> : null} Continue
          </Button>
          {this.props.additionalButtons}
        </div>
      </Form>
    )
  }

  private onServerAddressChanged = (serverAddress: string) => {
    this.setState({ serverAddress })
  }

  private onSubmit = () => {
    this.props.onSubmit(this.state.serverAddress)
  }
}
