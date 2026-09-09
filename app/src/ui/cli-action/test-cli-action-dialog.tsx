import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TabBar } from '../tab-bar'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { CLIAction } from '../../lib/cli-action'
import { assertNever } from '../../lib/fatal-error'

/** The CLI action kinds available to dispatch, in tab order. */
const tabs: ReadonlyArray<CLIAction['kind']> = ['open-repository', 'clone-url']

interface ITestCLIActionDialogProps {
  readonly dispatcher: Dispatcher

  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissible prop.
   */
  readonly onDismissed: () => void
}

interface ITestCLIActionDialogState {
  /** The index of the currently selected tab (see `tabs`). */
  readonly selectedTabIndex: number

  /** The path for the 'open-repository' action. */
  readonly path: string

  /** The url for the 'clone-url' action. */
  readonly url: string

  /** The optional branch for the 'clone-url' action. */
  readonly branch: string
}

/**
 * A development-only dialog that lets the user dispatch any of the CLI actions
 * (the same actions that are dispatched when invoking Desktop from the command
 * line). Each tab corresponds to one of the `CLIAction` discriminated union
 * members and exposes text inputs matching that member's properties.
 */
export class TestCLIActionDialog extends React.Component<
  ITestCLIActionDialogProps,
  ITestCLIActionDialogState
> {
  public constructor(props: ITestCLIActionDialogProps) {
    super(props)

    this.state = {
      selectedTabIndex: 0,
      path: '',
      url: '',
      branch: '',
    }
  }

  public render() {
    return (
      <Dialog
        id="test-cli-action"
        title="Dispatch CLI Action"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <TabBar
          onTabClicked={this.onTabClicked}
          selectedIndex={this.state.selectedTabIndex}
        >
          <span>Open repository</span>
          <span>Clone URL</span>
        </TabBar>

        <DialogContent>{this.renderActiveTab()}</DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Dispatch"
            okButtonDisabled={!this.isActionValid()}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderActiveTab() {
    const kind = tabs[this.state.selectedTabIndex]

    switch (kind) {
      case 'open-repository':
        return (
          <Row>
            <TextBox
              label="Path"
              placeholder="/path/to/repository"
              value={this.state.path}
              onValueChanged={this.onPathChanged}
              autoFocus={true}
            />
          </Row>
        )
      case 'clone-url':
        return (
          <>
            <Row>
              <TextBox
                label="URL"
                placeholder="https://github.com/desktop/desktop"
                value={this.state.url}
                onValueChanged={this.onUrlChanged}
                autoFocus={true}
              />
            </Row>
            <Row>
              <TextBox
                label="Branch (optional)"
                placeholder="main"
                value={this.state.branch}
                onValueChanged={this.onBranchChanged}
              />
            </Row>
          </>
        )
      default:
        return assertNever(kind, `Unknown CLI action kind: ${kind}`)
    }
  }

  private getAction(): CLIAction | null {
    const kind = tabs[this.state.selectedTabIndex]

    switch (kind) {
      case 'open-repository': {
        const path = this.state.path.trim()
        return path.length === 0 ? null : { kind, path }
      }
      case 'clone-url': {
        const url = this.state.url.trim()
        const branch = this.state.branch.trim()
        return url.length === 0
          ? null
          : { kind, url, branch: branch.length === 0 ? undefined : branch }
      }
      default:
        return assertNever(kind, `Unknown CLI action kind: ${kind}`)
    }
  }

  private isActionValid() {
    return this.getAction() !== null
  }

  private onTabClicked = (selectedTabIndex: number) => {
    this.setState({ selectedTabIndex })
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
  }

  private onUrlChanged = (url: string) => {
    this.setState({ url })
  }

  private onBranchChanged = (branch: string) => {
    this.setState({ branch })
  }

  private onSubmit = async () => {
    const action = this.getAction()

    if (action !== null) {
      await this.props.dispatcher.dispatchCLIAction(action)
    }

    this.props.onDismissed()
  }
}
