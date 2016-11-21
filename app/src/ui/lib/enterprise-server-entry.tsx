import * as React from 'react'
import { Button } from './button'
import { getEnterpriseAPIURL, fetchMetadata } from '../../lib/api'
import { Loading } from './loading'

/** The authentication methods server allows. */
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

  readonly loading: boolean
}

/** An entry form for an Enterprise server address. */
export class EnterpriseServerEntry extends React.Component<IEnterpriseServerEntryProps, IEnterpriseServerEntryState> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)

    this.state = { serverAddress: '', loading: false }
  }

  public render() {
    const disableEntry = this.state.loading
    const disableSubmission = !this.state.serverAddress.length || this.state.loading
    return (
      <form id='enterprise-server-entry' onSubmit={this.onSubmit}>
        <label>Enterprise server address
          <input autoFocus={true} disabled={disableEntry} onChange={this.onServerAddressChanged}/>
        </label>

        <Button type='submit' disabled={disableSubmission}>Continue</Button>

        {this.state.loading ? <Loading/> : null}
      </form>
    )
  }

  private onServerAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ serverAddress: event.currentTarget.value, loading: false })
  }

  private onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const authMethods = new Set([
      AuthenticationMethods.BasicAuth,
      AuthenticationMethods.OAuth,
    ])

    this.setState({ serverAddress: this.state.serverAddress, loading: true })

    const address = this.state.serverAddress
    const endpoint = getEnterpriseAPIURL(address)

    try {
      const response = await fetchMetadata(endpoint)
      if (response.verifiablePasswordAuthentication === false) {
        authMethods.delete(AuthenticationMethods.BasicAuth)
      }

      this.setState({ serverAddress: this.state.serverAddress, loading: false })

      this.props.onContinue(endpoint, authMethods)
    } catch (e) {
      this.setState({ serverAddress: this.state.serverAddress, loading: false })

      // TODO: probably means the server URL is bad or Enterprise is Real Old.
    }
  }
}
