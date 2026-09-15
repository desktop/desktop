import * as React from 'react'
import { Account } from '../../models/account'
import type {
  CopilotQuotaSnapshots,
  ICopilotQuotaSnapshot,
} from '../../lib/stores/copilot-store'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { SnapshotCard } from './snapshot-card'

interface ITestCopilotSnapshotCardDialogProps {
  readonly accounts: ReadonlyArray<Account>
  readonly onDismissed: () => void
}

type SnapshotKey =
  | 'chat'
  | 'completions'
  | 'premium_interactions'
  | 'session'
  | 'weekly'

interface ISnapshotDefinition {
  readonly key: SnapshotKey
  readonly label: string
}

const snapshotDefinitions: ReadonlyArray<ISnapshotDefinition> = [
  { key: 'chat', label: 'Chat messages' },
  { key: 'completions', label: 'Code completions' },
  { key: 'premium_interactions', label: 'Premium requests / AI credits' },
  { key: 'session', label: 'Session limits' },
  { key: 'weekly', label: 'Weekly limits' },
]

interface IEditableSnapshot {
  readonly enabled: boolean
  readonly tokenBasedBilling: boolean
  readonly isUnlimitedEntitlement: boolean
  readonly entitlementRequests: string
  readonly usedRequests: string
  readonly usageAllowedWithExhaustedQuota: boolean
  readonly remainingPercentage: string
  readonly overage: string
  readonly overageAllowedWithExhaustedQuota: boolean
  readonly resetDate: string
}

interface IEditableSnapshots {
  readonly chat: IEditableSnapshot
  readonly completions: IEditableSnapshot
  readonly premium_interactions: IEditableSnapshot
  readonly session: IEditableSnapshot
  readonly weekly: IEditableSnapshot
}

interface ITestCopilotSnapshotCardDialogState {
  readonly login: string
  readonly name: string
  readonly endpoint: string
  readonly avatarURL: string
  readonly snapshots: IEditableSnapshots
}

function defaultSnapshot(
  overrides: Partial<IEditableSnapshot> = {}
): IEditableSnapshot {
  return {
    enabled: true,
    tokenBasedBilling: false,
    isUnlimitedEntitlement: false,
    entitlementRequests: '100',
    usedRequests: '25',
    usageAllowedWithExhaustedQuota: false,
    remainingPercentage: '75',
    overage: '0',
    overageAllowedWithExhaustedQuota: false,
    resetDate: '',
    ...overrides,
  }
}

function getDefaultSnapshots(): IEditableSnapshots {
  return {
    chat: defaultSnapshot(),
    completions: defaultSnapshot({ enabled: false }),
    premium_interactions: defaultSnapshot({
      entitlementRequests: '300',
      usedRequests: '90',
      remainingPercentage: '70',
    }),
    session: defaultSnapshot({
      enabled: false,
      entitlementRequests: '0',
      usedRequests: '0',
      remainingPercentage: '100',
    }),
    weekly: defaultSnapshot({
      enabled: false,
      entitlementRequests: '0',
      usedRequests: '0',
      remainingPercentage: '100',
    }),
  }
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function checkboxValue(value: boolean): CheckboxValue {
  return value ? CheckboxValue.On : CheckboxValue.Off
}

function getResetDate(value: string): string | undefined {
  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function getSnapshot(snapshot: IEditableSnapshot): ICopilotQuotaSnapshot {
  return {
    tokenBasedBilling: snapshot.tokenBasedBilling,
    isUnlimitedEntitlement: snapshot.isUnlimitedEntitlement,
    entitlementRequests: parseNumber(snapshot.entitlementRequests, 0),
    usedRequests: parseNumber(snapshot.usedRequests, 0),
    usageAllowedWithExhaustedQuota: snapshot.usageAllowedWithExhaustedQuota,
    remainingPercentage: parseNumber(snapshot.remainingPercentage, 100),
    overage: parseNumber(snapshot.overage, 0),
    overageAllowedWithExhaustedQuota: snapshot.overageAllowedWithExhaustedQuota,
    resetDate: getResetDate(snapshot.resetDate),
  }
}

function getInitialAccount(
  accounts: ReadonlyArray<Account>
): Pick<
  ITestCopilotSnapshotCardDialogState,
  'login' | 'name' | 'endpoint' | 'avatarURL'
> {
  const account = accounts.find(a => a.login.trim().length > 0)

  return {
    login: account?.login ?? 'mona',
    name: account?.name ?? 'Mona Lisa',
    endpoint: account?.endpoint ?? 'https://api.github.com',
    avatarURL:
      account?.avatarURL ?? 'https://avatars.githubusercontent.com/u/1',
  }
}

export class TestCopilotSnapshotCardDialog extends React.Component<
  ITestCopilotSnapshotCardDialogProps,
  ITestCopilotSnapshotCardDialogState
> {
  public constructor(props: ITestCopilotSnapshotCardDialogProps) {
    super(props)
    const account = getInitialAccount(props.accounts)

    this.state = {
      ...account,
      snapshots: getDefaultSnapshots(),
    }
  }

  public render() {
    return (
      <Dialog
        id="test-copilot-snapshot-card"
        title="Test Copilot Snapshot Card"
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div className="test-copilot-snapshot-card-preview">
            <SnapshotCard
              account={this.getAccount()}
              snapshots={this.getSnapshots()}
            />
          </div>
          <div className="test-copilot-snapshot-card-controls">
            {this.renderAccountControls()}
            {snapshotDefinitions.map(snapshot =>
              this.renderSnapshotControls(snapshot)
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="test-copilot-snapshot-card-footer-buttons">
            <Button type="button" onClick={this.onUseTokenBasedBillingPreset}>
              AI credits preset
            </Button>
            <Button type="button" onClick={this.onUseRateLimitPreset}>
              Rate limit preset
            </Button>
          </div>
          <OkCancelButtonGroup okButtonText="Done" />
        </DialogFooter>
      </Dialog>
    )
  }

  private getAccount(): Account {
    return new Account(
      this.state.login.trim() || 'mona',
      this.state.endpoint.trim() || 'https://api.github.com',
      'fake-token',
      [],
      this.state.avatarURL.trim(),
      1,
      this.state.name.trim(),
      'free',
      'https://copilot-proxy.githubusercontent.com',
      true,
      [],
      'COPILOT_INDIVIDUAL'
    )
  }

  private getSnapshots(): CopilotQuotaSnapshots {
    const snapshots = new Map<string, ICopilotQuotaSnapshot>()

    for (const definition of snapshotDefinitions) {
      const snapshot = this.state.snapshots[definition.key]
      if (snapshot.enabled) {
        snapshots.set(definition.key, getSnapshot(snapshot))
      }
    }

    return snapshots
  }

  private renderAccountControls(): JSX.Element {
    return (
      <fieldset className="test-copilot-snapshot-card-fieldset">
        <legend>Fake account</legend>
        <div className="test-copilot-snapshot-card-grid">
          <TextBox
            label="Login"
            value={this.state.login}
            onValueChanged={this.onLoginChanged}
            autoFocus={true}
          />
          <TextBox
            label="Name"
            value={this.state.name}
            onValueChanged={this.onNameChanged}
          />
          <TextBox
            label="Endpoint"
            value={this.state.endpoint}
            onValueChanged={this.onEndpointChanged}
          />
          <TextBox
            label="Avatar URL"
            value={this.state.avatarURL}
            onValueChanged={this.onAvatarURLChanged}
          />
        </div>
      </fieldset>
    )
  }

  private renderSnapshotControls(definition: ISnapshotDefinition): JSX.Element {
    const snapshot = this.state.snapshots[definition.key]

    return (
      <fieldset
        className="test-copilot-snapshot-card-fieldset"
        key={definition.key}
      >
        <legend>{definition.label}</legend>
        <Row className="test-copilot-snapshot-card-checkbox-row">
          <Checkbox
            label="Enabled"
            value={checkboxValue(snapshot.enabled)}
            onChange={this.onSnapshotEnabledChanged(definition.key)}
          />
          <Checkbox
            label="Token-based billing"
            value={checkboxValue(snapshot.tokenBasedBilling)}
            onChange={this.onSnapshotTokenBasedBillingChanged(definition.key)}
          />
          <Checkbox
            label="Unlimited"
            value={checkboxValue(snapshot.isUnlimitedEntitlement)}
            onChange={this.onSnapshotUnlimitedChanged(definition.key)}
          />
        </Row>
        <div className="test-copilot-snapshot-card-grid">
          <TextBox
            label="Entitlement requests"
            value={snapshot.entitlementRequests}
            onValueChanged={this.onSnapshotEntitlementRequestsChanged(
              definition.key
            )}
          />
          <TextBox
            label="Used requests"
            value={snapshot.usedRequests}
            onValueChanged={this.onSnapshotUsedRequestsChanged(definition.key)}
          />
          <TextBox
            label="Remaining percentage"
            value={snapshot.remainingPercentage}
            onValueChanged={this.onSnapshotRemainingPercentageChanged(
              definition.key
            )}
          />
          <TextBox
            label="Overage"
            value={snapshot.overage}
            onValueChanged={this.onSnapshotOverageChanged(definition.key)}
          />
          <TextBox
            label="Reset date"
            value={snapshot.resetDate}
            placeholder="2026-07-10T12:00:00Z"
            onValueChanged={this.onSnapshotResetDateChanged(definition.key)}
          />
        </div>
        <Row className="test-copilot-snapshot-card-checkbox-row">
          <Checkbox
            label="Usage allowed with exhausted quota"
            value={checkboxValue(snapshot.usageAllowedWithExhaustedQuota)}
            onChange={this.onSnapshotUsageAllowedChanged(definition.key)}
          />
          <Checkbox
            label="Overage allowed with exhausted quota"
            value={checkboxValue(snapshot.overageAllowedWithExhaustedQuota)}
            onChange={this.onSnapshotOverageAllowedChanged(definition.key)}
          />
        </Row>
      </fieldset>
    )
  }

  private updateSnapshot(
    key: SnapshotKey,
    update: (snapshot: IEditableSnapshot) => IEditableSnapshot
  ) {
    this.setState(state => ({
      snapshots: {
        ...state.snapshots,
        [key]: update(state.snapshots[key]),
      },
    }))
  }

  private onLoginChanged = (login: string) => {
    this.setState({ login })
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private onEndpointChanged = (endpoint: string) => {
    this.setState({ endpoint })
  }

  private onAvatarURLChanged = (avatarURL: string) => {
    this.setState({ avatarURL })
  }

  private onSnapshotEnabledChanged =
    (key: SnapshotKey) => (event: React.FormEvent<HTMLInputElement>) => {
      const enabled = event.currentTarget.checked
      this.updateSnapshot(key, snapshot => ({ ...snapshot, enabled }))
    }

  private onSnapshotTokenBasedBillingChanged =
    (key: SnapshotKey) => (event: React.FormEvent<HTMLInputElement>) => {
      const tokenBasedBilling = event.currentTarget.checked
      this.updateSnapshot(key, snapshot => ({ ...snapshot, tokenBasedBilling }))
    }

  private onSnapshotUnlimitedChanged =
    (key: SnapshotKey) => (event: React.FormEvent<HTMLInputElement>) => {
      const isUnlimitedEntitlement = event.currentTarget.checked
      this.updateSnapshot(key, snapshot => ({
        ...snapshot,
        isUnlimitedEntitlement,
      }))
    }

  private onSnapshotUsageAllowedChanged =
    (key: SnapshotKey) => (event: React.FormEvent<HTMLInputElement>) => {
      const usageAllowedWithExhaustedQuota = event.currentTarget.checked
      this.updateSnapshot(key, snapshot => ({
        ...snapshot,
        usageAllowedWithExhaustedQuota,
      }))
    }

  private onSnapshotOverageAllowedChanged =
    (key: SnapshotKey) => (event: React.FormEvent<HTMLInputElement>) => {
      const overageAllowedWithExhaustedQuota = event.currentTarget.checked
      this.updateSnapshot(key, snapshot => ({
        ...snapshot,
        overageAllowedWithExhaustedQuota,
      }))
    }

  private onSnapshotEntitlementRequestsChanged =
    (key: SnapshotKey) => (entitlementRequests: string) => {
      this.updateSnapshot(key, snapshot => ({
        ...snapshot,
        entitlementRequests,
      }))
    }

  private onSnapshotUsedRequestsChanged =
    (key: SnapshotKey) => (usedRequests: string) => {
      this.updateSnapshot(key, snapshot => ({ ...snapshot, usedRequests }))
    }

  private onSnapshotRemainingPercentageChanged =
    (key: SnapshotKey) => (remainingPercentage: string) => {
      this.updateSnapshot(key, snapshot => ({
        ...snapshot,
        remainingPercentage,
      }))
    }

  private onSnapshotOverageChanged =
    (key: SnapshotKey) => (overage: string) => {
      this.updateSnapshot(key, snapshot => ({ ...snapshot, overage }))
    }

  private onSnapshotResetDateChanged =
    (key: SnapshotKey) => (resetDate: string) => {
      this.updateSnapshot(key, snapshot => ({ ...snapshot, resetDate }))
    }

  private onUseTokenBasedBillingPreset = () => {
    this.setState({
      snapshots: {
        chat: defaultSnapshot({
          tokenBasedBilling: true,
          isUnlimitedEntitlement: true,
          entitlementRequests: '-1',
          usedRequests: '0',
          remainingPercentage: '100',
        }),
        completions: defaultSnapshot({
          tokenBasedBilling: true,
          isUnlimitedEntitlement: true,
          entitlementRequests: '-1',
          usedRequests: '0',
          remainingPercentage: '100',
        }),
        premium_interactions: defaultSnapshot({
          tokenBasedBilling: true,
          entitlementRequests: '12.5',
          usedRequests: '2.5',
          remainingPercentage: '80',
        }),
        session: defaultSnapshot({
          enabled: false,
          tokenBasedBilling: true,
          entitlementRequests: '0',
          usedRequests: '0',
          remainingPercentage: '100',
        }),
        weekly: defaultSnapshot({
          enabled: false,
          tokenBasedBilling: true,
          entitlementRequests: '0',
          usedRequests: '0',
          remainingPercentage: '100',
        }),
      },
    })
  }

  private onUseRateLimitPreset = () => {
    const resetDate = new Date(Date.now() + 45 * 60 * 1000).toISOString()
    this.setState({
      snapshots: {
        ...getDefaultSnapshots(),
        session: defaultSnapshot({
          enabled: true,
          entitlementRequests: '0',
          usedRequests: '0',
          remainingPercentage: '35',
          resetDate,
        }),
        weekly: defaultSnapshot({
          enabled: true,
          entitlementRequests: '0',
          usedRequests: '0',
          remainingPercentage: '92',
        }),
      },
    })
  }
}
