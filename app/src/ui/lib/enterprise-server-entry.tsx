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
  /** Called after the user has entered their Enterprise endpoint. */
  readonly onContinue: (endpoint: string, authMethods: Set<AuthenticationMethods>) => void
}

interface IEnterpriseServerEntryState {
  readonly endpoint: string
}

/** An entry form for an Enterprise server. */
export class EnterpriseServerEntry extends React.Component<IEnterpriseServerEntryProps, IEnterpriseServerEntryState> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)

    this.state = { endpoint: '' }
  }

  public render() {
    const disabled = !this.state.endpoint.length
    return (
      <form id='enterprise-server-entry' onSubmit={this.onSubmit}>
        <label>Enterprise server address
          <input autoFocus={true} onChange={this.onEndpointChanged}/>
        </label>

        <Button type='submit' disabled={disabled}>Continue</Button>
      </form>
    )
  }

  private onEndpointChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ endpoint: event.currentTarget.value })
  }

  private onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const authMethods = new Set([
      AuthenticationMethods.BasicAuth,
      AuthenticationMethods.OAuth,
    ])

    const endpoint = this.state.endpoint
    const apiURL = getEnterpriseAPIURL(endpoint)
    const response = await fetchMetadata(apiURL)
    if (!response.verifiablePasswordAuthentication) {
      authMethods.delete(AuthenticationMethods.BasicAuth)
    }

    this.props.onContinue(apiURL, authMethods)
  }
}
