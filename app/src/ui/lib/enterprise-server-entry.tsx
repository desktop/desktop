import * as React from 'react'
import { Button } from './button'
import { getEnterpriseAPIURL, fetchMetadata } from '../../lib/api'

/** The authentication methods a server may allow. */
export enum AuthenticationMethods {
  /** Basic auth in order to create authorization tokens. */
  BasicAuth,

  /** OAuth web flow. */
  OAuth,
}

interface IEnterpriseServerEntryProps {
  /** Called after the user has entered their Enterprise server address. */
  readonly onContinue: (endpoint: string, authMethods: Set<AuthenticationMethods>) => void
}

interface IEnterpriseServerEntryState {
  readonly serverAddress: string
}

/** An entry form for an Enterprise server. */
export class EnterpriseServerEntry extends React.Component<IEnterpriseServerEntryProps, IEnterpriseServerEntryState> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)

    this.state = { serverAddress: '' }
  }

  public render() {
    const disabled = !this.state.serverAddress.length
    return (
      <form id='enterprise-server-entry' onSubmit={this.onSubmit}>
        <label>Enterprise server address
          <input autoFocus={true} onChange={this.onServerAddressChanged}/>
        </label>

        <Button type='submit' disabled={disabled}>Continue</Button>
      </form>
    )
  }

  private onServerAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ serverAddress: event.currentTarget.value })
  }

  private onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const authMethods = new Set([
      AuthenticationMethods.BasicAuth,
      AuthenticationMethods.OAuth,
    ])

    const address = this.state.serverAddress
    const endpoint = getEnterpriseAPIURL(address)
    const response = await fetchMetadata(endpoint)
    if (!response.verifiablePasswordAuthentication) {
      authMethods.delete(AuthenticationMethods.BasicAuth)
    }

    this.props.onContinue(endpoint, authMethods)
  }
}
