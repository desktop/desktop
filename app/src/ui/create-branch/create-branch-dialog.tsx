import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { sanitizedBranchName } from '../../lib/sanitize-branch'
import { Branch } from '../../models/branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Ref } from '../lib/ref'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import {
  TipState,
  IUnbornRepository,
  IDetachedHead,
  IValidBranch,
} from '../../models/tip'
import { assertNever } from '../../lib/fatal-error'
import { renderBranchNameWarning } from '../lib/branch-name-warnings'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly tip: IUnbornRepository | IDetachedHead | IValidBranch
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly initialName: string
}

enum StartPoint {
  CurrentBranch,
  DefaultBranch,
  Head,
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string
  readonly sanitizedName: string
  readonly startPoint: StartPoint

  /**
   * Whether or not the dialog is currently creating a branch. This affects
   * the dialog loading state as well as the rendering of the branch selector.
   *
   * When the dialog is creating a branch we take the tip and defaultBranch
   * as they were in props at the time of creation and stick them in state
   * so that we can maintain the layout of the branch selection parts even
   * as the Tip changes during creation.
   *
   * Note: once branch creation has been initiated this value stays at true
   * and will never revert to being false. If the branch creation operation
   * fails this dialog will still be dismissed and an error dialog will be
   * shown in its place.
   */
  readonly isCreatingBranch: boolean

  /**
   * The tip of the current repository, captured from props at the start
   * of the create branch operation.
   */
  readonly tipAtCreateStart: IUnbornRepository | IDetachedHead | IValidBranch

  /**
   * The default branch of the current repository, captured from props at the
   * start of the create branch operation.
   */
  readonly defaultBranchAtCreateStart: Branch | null
}

enum SelectedBranch {
  DefaultBranch = 0,
  CurrentBranch = 1,
}

function getStartPoint(
  props: ICreateBranchProps,
  preferred: StartPoint
): StartPoint {
  if (preferred === StartPoint.DefaultBranch && props.defaultBranch) {
    return preferred
  }

  if (
    preferred === StartPoint.CurrentBranch &&
    props.tip.kind === TipState.Valid
  ) {
    return preferred
  }

  if (preferred === StartPoint.Head) {
    return preferred
  }

  if (props.defaultBranch) {
    return StartPoint.DefaultBranch
  } else if (props.tip.kind === TipState.Valid) {
    return StartPoint.CurrentBranch
  } else {
    return StartPoint.Head
  }
}

/** The Create Branch component. */
export class CreateBranch extends React.Component<
  ICreateBranchProps,
  ICreateBranchState
> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: props.initialName,
      sanitizedName: '',
      startPoint: getStartPoint(props, StartPoint.DefaultBranch),
      isCreatingBranch: false,
      tipAtCreateStart: props.tip,
      defaultBranchAtCreateStart: props.defaultBranch,
    }
  }

  public componentDidMount() {
    if (this.state.proposedName.length) {
      this.updateBranchName(this.state.proposedName)
    }
  }

  public componentWillReceiveProps(nextProps: ICreateBranchProps) {
    this.setState({
      startPoint: getStartPoint(nextProps, this.state.startPoint),
    })

    if (!this.state.isCreatingBranch) {
      this.setState({
        tipAtCreateStart: nextProps.tip,
        defaultBranchAtCreateStart: nextProps.defaultBranch,
      })
    }
  }

  private renderBranchSelection() {
    const tip = this.state.isCreatingBranch
      ? this.state.tipAtCreateStart
      : this.props.tip

    const tipKind = tip.kind

    if (tip.kind === TipState.Detached) {
      return (
        <p>
          You do not currently have any branch checked out (your HEAD reference
          is detached). As such your new branch will be based on your currently
          checked out commit ({tip.currentSha.substr(0, 7)}
          ).
        </p>
      )
    } else if (tip.kind === TipState.Unborn) {
      return (
        <p>
          Your current branch is unborn (does not contain any commits). Creating
          a new branch will rename the current branch.
        </p>
      )
    } else if (tip.kind === TipState.Valid) {
      const currentBranch = tip.branch
      const defaultBranch = this.state.isCreatingBranch
        ? this.props.defaultBranch
        : this.state.defaultBranchAtCreateStart

      if (!defaultBranch || defaultBranch.name === currentBranch.name) {
        const defaultBranchLink = (
          <LinkButton uri="https://help.github.com/articles/setting-the-default-branch/">
            default branch
          </LinkButton>
        )
        return (
          <p>
            Your new branch will be based on your currently checked out branch (
            <Ref>{currentBranch.name}</Ref>
            ). <Ref>{currentBranch.name}</Ref> is the {defaultBranchLink} for
            your repository.
          </p>
        )
      } else {
        const items = [
          {
            title: defaultBranch.name,
            description:
              "The default branch in your repository. Pick this to start on something new that's not dependent on your current branch.",
          },
          {
            title: currentBranch.name,
            description:
              'The currently checked out branch. Pick this if you need to build on work done in this branch.',
          },
        ]

        const startPoint = this.state.startPoint
        const selectedIndex = startPoint === StartPoint.DefaultBranch ? 0 : 1

        return (
          <Row>
            <VerticalSegmentedControl
              label="Create branch based on…"
              items={items}
              selectedIndex={selectedIndex}
              onSelectionChanged={this.onBaseBranchChanged}
            />
          </Row>
        )
      }
    } else {
      return assertNever(tip, `Unknown tip kind ${tipKind}`)
    }
  }

  private onBaseBranchChanged = (selection: SelectedBranch) => {
    if (selection === SelectedBranch.DefaultBranch) {
      this.setState({ startPoint: StartPoint.DefaultBranch })
    } else if (selection === SelectedBranch.CurrentBranch) {
      this.setState({ startPoint: StartPoint.CurrentBranch })
    } else {
      throw new Error(`Unknown branch selection: ${selection}`)
    }
  }

  public render() {
    const disabled =
      this.state.proposedName.length <= 0 ||
      !!this.state.currentError ||
      /^\s*$/.test(this.state.sanitizedName)
    const error = this.state.currentError

    return (
      <Dialog
        id="create-branch"
        title={__DARWIN__ ? 'Create a Branch' : 'Create a branch'}
        onSubmit={this.createBranch}
        onDismissed={this.props.onDismissed}
        loading={this.state.isCreatingBranch}
        disabled={this.state.isCreatingBranch}
      >
        {error ? <DialogError>{error.message}</DialogError> : null}

        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              value={this.state.proposedName}
              autoFocus={true}
              onValueChanged={this.onBranchNameChange}
            />
          </Row>

          {renderBranchNameWarning(
            this.state.proposedName,
            this.state.sanitizedName
          )}

          {this.renderBranchSelection()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {__DARWIN__ ? 'Create Branch' : 'Create branch'}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onBranchNameChange = (name: string) => {
    this.updateBranchName(name)
  }

  private updateBranchName(name: string) {
    const sanitizedName = sanitizedBranchName(name)
    const alreadyExists =
      this.props.allBranches.findIndex(b => b.name === sanitizedName) > -1
    const currentError = alreadyExists
      ? new Error(`A branch named ${sanitizedName} already exists`)
      : null

    this.setState({ proposedName: name, sanitizedName, currentError })
  }

  private createBranch = async () => {
    const name = this.state.sanitizedName

    let startPoint = undefined

    if (this.state.startPoint === StartPoint.DefaultBranch) {
      // This really shouldn't happen, we take all kinds of precautions
      // to make sure the startPoint state is valid given the current props.
      if (!this.props.defaultBranch) {
        this.setState({
          currentError: new Error('Could not determine the default branch'),
        })
        return
      }

      startPoint = this.props.defaultBranch.name
    }

    if (name.length > 0) {
      this.setState({ isCreatingBranch: true })
      await this.props.dispatcher.createBranch(
        this.props.repository,
        name,
        startPoint
      )
      this.props.onDismissed()
    }
  }
}
