import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import { sanitizedBranchName } from '../../lib/sanitize-branch'
import { Branch } from '../../models/branch'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { TipState, IUnbornRepository, IDetachedHead, IValidBranch } from '../../models/tip'
import { assertNever } from '../../lib/fatal-error'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly tip: IUnbornRepository | IDetachedHead | IValidBranch
  readonly defaultBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
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
  readonly loading: boolean
}

enum SelectedBranch {
  DefaultBranch = 0,
  CurrentBranch = 1,
}

function getStartPoint(props: ICreateBranchProps, preferred: StartPoint): StartPoint {
  if (preferred === StartPoint.DefaultBranch && props.defaultBranch) {
    return preferred
  }

  if (preferred === StartPoint.CurrentBranch && props.tip.kind === TipState.Valid) {
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
export class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: '',
      sanitizedName: '',
      startPoint: getStartPoint(props, StartPoint.DefaultBranch),
      loading: false,
    }
  }

  public componentWillReceiveProps(nextProps: ICreateBranchProps) {
    this.setState({
      startPoint: getStartPoint(nextProps, this.state.startPoint),
    })
  }

  private renderBranchSelection() {
    const tip = this.props.tip
    const tipKind = tip.kind

    if (tip.kind === TipState.Detached) {
      return (
        <p>
          You do not currently have any branch checked out (your HEAD reference
          is detached). As such your new branch will be based on your
          currently checked out commit ({tip.currentSha.substr(0, 7)}).
        </p>
      )
    } else if (tip.kind === TipState.Unborn) {
      return (
        <p>
          Your current branch is unborn (does not contain any commits).
          Creating a new branch will rename the current branch.
        </p>
      )
    } else if (tip.kind === TipState.Valid) {

      const currentBranch = tip.branch
      const defaultBranch = this.props.defaultBranch

      if (!defaultBranch || defaultBranch.name === currentBranch.name) {
        const defaultBranchLink = <LinkButton uri='https://help.github.com/articles/setting-the-default-branch/'>default branch</LinkButton>
        return (
          <p>
            Your new branch will be based on your currently checked out
            branch ({currentBranch.name}). This branch is
            the {defaultBranchLink} for your repository.
          </p>
        )
      } else {
        const items = [
          {
            title: defaultBranch.name,
            description: 'The default branch in your repository. Pick this to start on something new that\'s not dependent on your current branch.',
          },
          {
            title: currentBranch.name,
            description: 'The currently checked out branch. Pick this if you need to build on work done in this branch.',
          },
        ]

        const startPoint = this.state.startPoint
        const selectedIndex = startPoint === StartPoint.DefaultBranch ? 0 : 1

        return (
          <Row>
            <VerticalSegmentedControl
              label='Create branch based on…'
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

  private renderWarning() {
    if (/^\s+$/.test(this.state.proposedName)) {
      return this.renderWarningMessage('Branch name cannot be empty')
    } else if (this.state.proposedName !== this.state.sanitizedName) {
      return this.renderWarningMessage(`Will be created as ${this.state.sanitizedName}`)
    } else {
      return null
    }
  }

  private renderWarningMessage(message: string) {
    return (
      <Row className='warning-helper-text'>
        <Octicon symbol={OcticonSymbol.alert} />
        {message}
      </Row>
    )
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName.length || !!this.state.currentError || /^\s*$/.test(this.state.proposedName)
    const error = this.state.currentError

    return (
      <Dialog
        id='create-branch'
        title='Create a branch'
        onSubmit={this.createBranch}
        onDismissed={this.props.onDismissed}
        loading={this.state.loading}
        disabled={this.state.loading}
      >
        {error ? <DialogError>{error.message}</DialogError> : null}

        <DialogContent>
          <Row>
            <TextBox
              label='Name'
              autoFocus={true}
              onChange={this.onBranchNameChange} />
          </Row>

          {this.renderWarning()}

          {this.renderBranchSelection()}
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>{__DARWIN__ ? 'Create Branch' : 'Create branch'}</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onBranchNameChange = (event: React.FormEvent<HTMLInputElement>) => {
    const str = event.currentTarget.value
    const sanitizedName = sanitizedBranchName(str)
    const alreadyExists = this.props.allBranches.findIndex(b => b.name === sanitizedName) > -1
    let currentError: Error | null = null
    if (alreadyExists) {
      currentError = new Error(`A branch named ${sanitizedName} already exists`)
    }

    this.setState({ proposedName: str, sanitizedName })
  }

  private createBranch = async () => {
    const name = this.state.sanitizedName

    let startPoint = undefined

    if (this.state.startPoint === StartPoint.DefaultBranch) {
      // This really shouldn't happen, we take all kinds of precautions
      // to make sure the startPoint state is valid given the current props.
      if (!this.props.defaultBranch) {
        this.setState({ currentError: new Error('Could not determine the default branch') })
        return
      }

      startPoint = this.props.defaultBranch.name
    }

    if (name.length > 0) {
      this.setState({ loading: true })
      await this.props.dispatcher.createBranch(this.props.repository, name, startPoint)
      this.props.onDismissed()
    }
  }
}
