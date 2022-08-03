import * as React from 'react'
import { Select } from '../lib/select'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'

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
        <div className="header">
          <div className="title">Comparing Changes</div>
          <div className="middle-box"></div>
          <Button type="submit" onClick={this.props.onCreatePullRequest}>
            Create Pull Request
          </Button>
          <Button onClick={this.props.onCancelPullRequest}>Cancel</Button>
        </div>
        <div className="controls">
          <div>
            Showing the changes made by merging commits into
            <div className="branch-box">
              <Select defaultValue={this.props.mergeBaseBranch.name}>
                {this.props.branches.map(branch => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            from
            <Ref>{this.props.currentBranch.name}</Ref>
          </div>
        </div>
      </div>
    )
  }
}
