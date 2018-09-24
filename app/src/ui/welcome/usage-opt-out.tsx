import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Form } from '../lib/form'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { SamplesURL } from '../../lib/stats'

interface IUsageOptOutProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly done: () => void
  readonly optOut: boolean
}

interface IUsageOptOutState {
  readonly newOptOutValue: boolean
}

/** The Welcome flow step for opting out of stats reporting. */
export class UsageOptOut extends React.Component<
  IUsageOptOutProps,
  IUsageOptOutState
> {
  public constructor(props: IUsageOptOutProps) {
    super(props)

    this.state = { newOptOutValue: props.optOut }
  }

  public render() {
    return (
      <div className="usage-opt-out">
        <h1 className="welcome-title">Make GitHub Desktop&nbsp;better!</h1>

        <p>
          Would you like to help us improve GitHub Desktop by periodically
          submitting <LinkButton uri={SamplesURL}>usage stats</LinkButton>?
        </p>

        <Form onSubmit={this.finish}>
          <Row>
            <Checkbox
              label="Yes, submit periodic usage stats"
              value={
                this.state.newOptOutValue ? CheckboxValue.Off : CheckboxValue.On
              }
              onChange={this.onChange}
            />
          </Row>

          <Row className="actions">
            <Button type="submit">Finish</Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </Row>
        </Form>
      </div>
    )
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked
    this.setState({ newOptOutValue: !value })
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private finish = () => {
    this.props.dispatcher.setStatsOptOut(this.state.newOptOutValue)
    // new users do not need to see the usage notes warning
    this.props.dispatcher.markUsageStatsNoteSeen()
    this.props.done()
  }
}
