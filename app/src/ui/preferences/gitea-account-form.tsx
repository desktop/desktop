import * as React from 'react'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { PasswordTextBox } from '../lib/password-text-box'
import { Row } from '../lib/row'
import { InputError } from '../lib/input-description/input-error'
import { CallToAction } from '../lib/call-to-action'
import { teamGiteaServer } from '../../lib/team-links'

interface IGiteaAccountFormProps {
  /** Whether any Gitea accounts have been added already */
  readonly hasGiteaAccounts: boolean

  /**
   * Called to add a Gitea account. The promise is expected to reject with an
   * error describing the problem if the account couldn't be added.
   */
  readonly onAddGiteaAccount: (
    serverAddress: string,
    token: string
  ) => Promise<unknown>
}

interface IGiteaAccountFormState {
  readonly expanded: boolean
  readonly serverAddress: string
  readonly token: string
  readonly loading: boolean
  readonly error: string | null
}

const initialState: IGiteaAccountFormState = {
  expanded: false,
  serverAddress: teamGiteaServer,
  token: '',
  loading: false,
  error: null,
}

/**
 * A form for adding an account on a Gitea (or Forgejo) server using a personal
 * access token.
 */
export class GiteaAccountForm extends React.Component<
  IGiteaAccountFormProps,
  IGiteaAccountFormState
> {
  private mounted = false

  public constructor(props: IGiteaAccountFormProps) {
    super(props)
    this.state = initialState
  }

  public componentDidMount() {
    this.mounted = true
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  public render() {
    if (!this.state.expanded) {
      return this.props.hasGiteaAccounts ? (
        <Button onClick={this.onExpand}>Add Gitea account</Button>
      ) : (
        <CallToAction actionTitle="Add Gitea account" onAction={this.onExpand}>
          <div>
            Add an account on a Gitea server to see and create pull requests for
            repositories hosted there.
          </div>
        </CallToAction>
      )
    }

    const { serverAddress, token, loading, error } = this.state
    const disabled =
      loading || serverAddress.trim().length === 0 || token.trim().length === 0

    return (
      <div className="gitea-account-form">
        <Row>
          <TextBox
            label="Server address"
            placeholder={teamGiteaServer}
            value={serverAddress}
            onValueChanged={this.onServerAddressChanged}
            disabled={loading}
            autoFocus={true}
          />
        </Row>
        <Row>
          <PasswordTextBox
            label="Personal access token"
            value={token}
            onValueChanged={this.onTokenChanged}
            disabled={loading}
          />
        </Row>
        <p className="gitea-token-hint">
          Create a token in Gitea under Settings &gt; Applications with the
          read:user and write:repository scopes.
        </p>
        {error !== null && (
          <InputError
            id="gitea-account-error"
            trackedUserInput={error}
            ariaLiveMessage={error}
          >
            {error}
          </InputError>
        )}
        <Row>
          <Button onClick={this.onSubmit} disabled={disabled}>
            {loading ? 'Adding…' : 'Add account'}
          </Button>
          <Button onClick={this.onCancel} disabled={loading}>
            Cancel
          </Button>
        </Row>
      </div>
    )
  }

  private onExpand = () => {
    this.setState({ ...initialState, expanded: true })
  }

  private onCancel = () => {
    this.setState(initialState)
  }

  private onServerAddressChanged = (serverAddress: string) => {
    this.setState({ serverAddress, error: null })
  }

  private onTokenChanged = (token: string) => {
    this.setState({ token, error: null })
  }

  private onSubmit = async () => {
    const { serverAddress, token } = this.state
    this.setState({ loading: true, error: null })

    try {
      await this.props.onAddGiteaAccount(serverAddress, token)
      if (this.mounted) {
        this.setState(initialState)
      }
    } catch (e) {
      if (this.mounted) {
        const message = e instanceof Error ? e.message : `${e}`
        this.setState({
          loading: false,
          error: `Unable to add the Gitea account: ${message}`,
        })
      }
    }
  }
}
