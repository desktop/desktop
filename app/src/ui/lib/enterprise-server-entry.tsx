import * as React from 'react'
import { Loading } from './loading'
import { Form } from './form'
import { TextBox } from './text-box'
import { Button } from './button'
import { Errors } from './errors'

interface IEnterpriseServerEntryProps {
  readonly loading?: boolean,
  readonly error?: Error,

  readonly onSubmit: (url: string) => void

  /** An array of additional buttons to render after the "Continue" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface IEnterpriseServerEntryState {
  readonly serverAddress: string
}

/** An entry form for an Enterprise server address. */
export class EnterpriseServerEntry extends React.Component<IEnterpriseServerEntryProps, IEnterpriseServerEntryState> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)
    this.state = { serverAddress: '' }
  }

  public render() {
    const disableEntry = this.props.loading
    const disableSubmission = !this.state.serverAddress.length || this.props.loading
    return (
      <Form onSubmit={this.onSubmit}>
        <TextBox
          label='Enterprise server address'
          autoFocus={true}
          disabled={disableEntry}
          onChange={this.onServerAddressChanged}/>

        <Button type='submit' disabled={disableSubmission}>Continue</Button>

        {this.props.additionalButtons}

        {this.props.loading ? <Loading/> : null}

        {this.props.error ? <Errors>{this.props.error.message}</Errors> : null}
      </Form>
    )
  }

  private onServerAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ serverAddress: event.currentTarget.value })
  }

  private onSubmit = () => {
    this.props.onSubmit(this.state.serverAddress)
  }
}
