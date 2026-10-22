import * as React from 'react'
import { Account } from '../../models/account'
import { IAccountTokenExpiration } from '../../lib/credential-sessions'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { Row } from '../lib/row'

interface ITestTokenExpirationDialogProps {
  readonly accounts: ReadonlyArray<Account>
  readonly dispatcher: Pick<
    Dispatcher,
    | 'getAccountTokenExpirationForTesting'
    | 'setAccountTokenExpirationForTesting'
  >
  readonly onDismissed: () => void
}

interface ITestTokenExpirationDialogState {
  readonly endpoint: string
  readonly expiration: IAccountTokenExpiration | null
  readonly dateTime: string
  readonly busy: boolean
  readonly error: string | null
  readonly message: string | null
}

function localDateTime(expiresAt: number | undefined): string {
  if (expiresAt === undefined) {
    return ''
  }
  const date = new Date(expiresAt)
  return new Date(expiresAt - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19)
}

function describeExpiration(expiresAt: number | undefined): string {
  return expiresAt === undefined
    ? 'Unknown'
    : new Date(expiresAt).toLocaleString()
}

/** Session-only controls for exercising access-token expiration and renewal. */
export class TestTokenExpirationDialog extends React.Component<
  ITestTokenExpirationDialogProps,
  ITestTokenExpirationDialogState
> {
  private requestId = 0
  private readonly presets = [
    { label: 'Expired', onClick: () => this.usePreset(-1) },
    { label: 'In 10 min', onClick: () => this.usePreset(10) },
    { label: 'In 1h', onClick: () => this.usePreset(60) },
    { label: 'In 62 min', onClick: () => this.usePreset(62) },
    { label: 'In 8h', onClick: () => this.usePreset(480) },
  ]

  public constructor(props: ITestTokenExpirationDialogProps) {
    super(props)
    this.state = {
      endpoint: props.accounts[0]?.endpoint ?? '',
      expiration: null,
      dateTime: '',
      busy: false,
      error: null,
      message: null,
    }
  }

  public componentDidMount() {
    void this.loadExpiration()
  }

  public componentDidUpdate(prevProps: ITestTokenExpirationDialogProps) {
    const account = this.getSelectedAccount()
    const previousAccount = prevProps.accounts.find(
      a => a.endpoint === this.state.endpoint
    )
    if (
      account === undefined &&
      (this.state.endpoint !== '' || this.props.accounts.length > 0)
    ) {
      this.setState(
        { endpoint: this.props.accounts[0]?.endpoint ?? '' },
        this.loadExpiration
      )
    } else if (account !== previousAccount) {
      void this.loadExpiration()
    }
  }

  public componentWillUnmount() {
    this.requestId++
  }

  public render() {
    const { expiration, busy, error, dateTime, message } = this.state
    const disabled = busy || expiration?.isRefreshable !== true
    return (
      <Dialog
        id="test-token-expiration"
        title="Test Token Expiration"
        onSubmit={this.onApply}
        onDismissed={this.props.onDismissed}
      >
        {error !== null && <DialogError>{error}</DialogError>}
        <DialogContent>
          <p>
            Change Desktop&apos;s local access-token expiration, not
            GitHub&apos;s actual token lifetime. Overrides reset on token
            renewal or app restart. No credentials are displayed or saved by
            this dialog.
          </p>
          {this.props.accounts.length === 0 ? (
            <p>
              Sign in to an account with a refreshable token to test expiration.
            </p>
          ) : (
            <>
              <Row>
                <Select
                  label="Account"
                  value={this.state.endpoint}
                  disabled={busy}
                  onChange={this.onAccountChanged}
                >
                  {this.props.accounts.map(account => (
                    <option key={account.endpoint} value={account.endpoint}>
                      {account.login} ({account.friendlyEndpoint})
                    </option>
                  ))}
                </Select>
              </Row>
              {expiration !== null && (
                <>
                  <p>
                    Current local expiry:{' '}
                    {describeExpiration(expiration.expiresAt)}
                    {expiration.isOverridden && ' (overridden)'}
                  </p>
                  {expiration.isOverridden && (
                    <p>
                      Original expiry:{' '}
                      {describeExpiration(expiration.originalExpiresAt)}
                    </p>
                  )}
                  {!expiration.isRefreshable && (
                    <p>
                      This account does not have a refreshable token. Sign in
                      again with short-lived tokens enabled to test expiration.
                    </p>
                  )}
                </>
              )}
              <Row>
                <div className="text-box-component">
                  <label htmlFor="test-token-expiration-date-time">
                    Expiration (local time)
                  </label>
                  <input
                    id="test-token-expiration-date-time"
                    type="datetime-local"
                    step={1}
                    value={dateTime}
                    disabled={disabled}
                    required={true}
                    onChange={this.onDateTimeChanged}
                  />
                </div>
              </Row>
              <Row className="token-expiration-presets">
                {this.presets.map(preset => (
                  <Button
                    key={preset.label}
                    type="button"
                    disabled={disabled}
                    onClick={preset.onClick}
                  >
                    {preset.label}
                  </Button>
                ))}
              </Row>
              <p>
                Ordinary requests refresh within 10 minutes of expiry. Copilot
                session creation refreshes within 61 minutes and 1 second.
                Renewal happens when authenticated work next requests a token.
              </p>
              <Row>
                <Button
                  type="button"
                  disabled={busy || expiration?.isOverridden !== true}
                  onClick={this.onReset}
                >
                  Reset override
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={this.loadExpiration}
                >
                  Reload details
                </Button>
              </Row>
            </>
          )}
          {message !== null && <p role="status">{message}</p>}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Apply expiry"
            okButtonDisabled={
              disabled || this.getChosenExpiration() === undefined
            }
            cancelButtonText="Close"
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private getSelectedAccount() {
    return this.props.accounts.find(a => a.endpoint === this.state.endpoint)
  }

  private getChosenExpiration(): number | undefined {
    const value = new Date(this.state.dateTime).getTime()
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined
  }

  private loadExpiration = async () => {
    const id = ++this.requestId
    const account = this.getSelectedAccount()
    this.setState({
      expiration: null,
      busy: account !== undefined,
      error: null,
      message: null,
    })
    if (account === undefined) {
      return
    }
    try {
      const expiration =
        await this.props.dispatcher.getAccountTokenExpirationForTesting(account)
      if (id === this.requestId) {
        this.setState({
          expiration,
          dateTime: localDateTime(expiration.expiresAt),
          busy: false,
        })
      }
    } catch (error) {
      log.error('Unable to read test token expiration', error)
      if (id === this.requestId) {
        this.setState({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to read token expiration. See the log for details.',
          busy: false,
        })
      }
    }
  }

  private onAccountChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ endpoint: event.currentTarget.value }, this.loadExpiration)
  }

  private onDateTimeChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ dateTime: event.currentTarget.value, message: null })
  }

  private usePreset(minutes: number) {
    this.setState({
      dateTime: localDateTime(Date.now() + minutes * 60_000),
      message: null,
    })
  }

  private onApply = async () => {
    const expiresAt = this.getChosenExpiration()
    if (expiresAt === undefined) {
      this.setState({ error: 'Choose a valid token expiration date and time.' })
      return
    }
    await this.updateExpiration(expiresAt)
  }

  private onReset = () => this.updateExpiration(undefined)

  private async updateExpiration(expiresAt: number | undefined) {
    const account = this.getSelectedAccount()
    if (account === undefined) {
      this.setState({ error: 'Select a signed-in account.' })
      return
    }
    const id = ++this.requestId
    this.setState({ busy: true, error: null, message: null })
    try {
      const expiration =
        await this.props.dispatcher.setAccountTokenExpirationForTesting(
          account,
          expiresAt
        )
      if (id === this.requestId) {
        this.setState({
          expiration,
          dateTime: localDateTime(expiration.expiresAt),
          busy: false,
          message:
            expiresAt === undefined
              ? 'Original expiration restored.'
              : 'Expiration override applied.',
        })
      }
    } catch (error) {
      log.error('Unable to change test token expiration', error)
      if (id === this.requestId) {
        this.setState({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to change token expiration. See the log for details.',
          busy: false,
        })
      }
    }
  }
}
