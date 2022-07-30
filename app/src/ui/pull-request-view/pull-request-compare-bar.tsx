import * as React from 'react'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { FancyTextBox } from '../lib/fancy-text-box'
import { Select } from '../lib/select'
import { Octicon } from '../octicons'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'

interface IPullRequestCompareBarProps {
  readonly branches: ReadonlyArray<Branch>
  readonly currentBranch: Branch
  readonly mergeBaseBranch: Branch

  readonly onCreatePullRequest: () => void
  readonly onCancelPullRequest: () => void
}

export class PullRequestCompareBar extends React.Component<IPullRequestCompareBarProps> {
  public render() {
    return (
      <div className="pull-request-compare-bar">
        <div className="title">Comparing Changes</div>
        <div className="subtitle">
          Choose two branches to see what’s changed or to start a new pull
          request.
        </div>
        <div className="controls">
          <Octicon symbol={OcticonSymbol.gitCompare} />

          <div className="branch-box">
            <Select defaultValue={this.props.mergeBaseBranch.name}>
              {this.props.branches.map(branch => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>

          <Octicon symbol={OcticonSymbol.arrowLeft} />

          <div className="branch-box">
            <FancyTextBox
              type="search"
              value={this.props.currentBranch.name}
              disabled={true}
            />
          </div>

          <div className="middle-box"></div>

          <Button type="submit" onClick={this.props.onCreatePullRequest}>
            Create Pull Request
          </Button>

          <Button onClick={this.props.onCancelPullRequest}>Cancel</Button>
        </div>
      </div>
    )
  }
}
