import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean,
  readonly confirmRepoRemoval: boolean,
  readonly onOptOutSet: (checked: boolean) => void
  readonly onConfirmRepoRemovalSet: (checked: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
  readonly confirmRepoRemoval: boolean
}

export class Advanced extends React.Component<IAdvancedPreferencesProps, IAdvancedPreferencesState> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: this.props.isOptedOut,
      confirmRepoRemoval: this.props.confirmRepoRemoval,
    }
  }

  private onReportingOptOutChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = !event.currentTarget.checked

    this.setState({ reportingOptOut: value })
    this.props.onOptOutSet(value)
  }

  private onConfirmRepoRemovalChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepoRemoval: value })
    this.props.onConfirmRepoRemovalSet(value)
  }

  public reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting <LinkButton uri={SamplesURL}>anonymous usage data</LinkButton>
      </span>
    )
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On}
            onChange={this.onReportingOptOutChanged} />
        </Row>
        <Row>
          <Checkbox
            label='Show confirmation dialog before removing repositories'
            value={this.state.confirmRepoRemoval ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onConfirmRepoRemovalChanged} />
        </Row>
      </DialogContent>
    )
  }
}
