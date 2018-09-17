import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Ref } from '../lib/ref'

interface IUsageStatsChangeProps {
  readonly onDismissed: (optOut: boolean) => void
  readonly onOpenUsageDataUrl: () => void
}

interface IUsageStatsChangeState {
  readonly optOutOfUsageTracking: boolean
}

/**
 * The dialog shown if the user has not seen the details about how our usage
 * tracking has changed
 */
export class UsageStatsChange extends React.Component<
  IUsageStatsChangeProps,
  IUsageStatsChangeState
> {
  public constructor(props: IUsageStatsChangeProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="usage-reporting"
        title={
          __DARWIN__ ? 'Usage Reporting Changes' : 'Usage reporting changes'
        }
        dismissable={false}
        onDismissed={this.onDismissed}
        onSubmit={this.onDismissed}
        type="normal"
      >
        <DialogContent>
          <Row>
            GitHub Desktop has introduced a change around how it reports usage
            stats, to help us better understand how our GitHub users get value
            from Desktop:
          </Row>
          <Row>
            <ul>
              <li>
                <span>
                  <strong>If you are signed into a GitHub account</strong>, your
                  GitHub.com account ID will be included in the periodic usage
                  stats.
                </span>
              </li>
              <li>
                <span>
                  <strong>
                    If you are only signed into a GitHub Enterprise account, or
                    only using Desktop with non-GitHub remotes
                  </strong>
                  , nothing is going to change.
                </span>
              </li>
            </ul>
          </Row>
          <Row className="selection">
            <Checkbox
              label="Help GitHub Desktop improve by submitting usage data"
              value={
                this.state.optOutOfUsageTracking
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onReportingOptOutChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Save</Button>
            <Button onClick={this.viewMoreInfo}>
              {' '}
              {__DARWIN__ ? 'More Info' : 'More info'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked
    this.setState({ optOutOfUsageTracking: value })
  }

  private onDismissed = () => {
    this.props.onDismissed(this.state.optOutOfUsageTracking)
  }

  private viewMoreInfo = () => {
    this.props.onOpenUsageDataUrl()
  }
}
