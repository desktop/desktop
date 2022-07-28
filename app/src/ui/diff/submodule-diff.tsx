import React from 'react'
import { parseRepositoryIdentifier } from '../../lib/remote-parsing'
import { ISubmoduleDiff } from '../../models/diff'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { SuggestedAction } from '../suggested-actions'

interface ISubmoduleDiffProps {
  readonly onOpenSubmodule?: (fullPath: string) => void
  readonly diff: ISubmoduleDiff
}

export class SubmoduleDiff extends React.Component<ISubmoduleDiffProps> {
  public constructor(props: ISubmoduleDiffProps) {
    super(props)
  }

  public render() {
    return (
      <div id="submodule-diff">
        <div className="content">
          <div className="header">
            <div className="text">
              <h1>Submodule changes</h1>
            </div>
          </div>
          {this.renderSubmoduleInfo()}
          {this.renderCommitChangeInfo()}
          {this.renderSubmodulesChangesInfo()}
          {this.renderOpenSubmoduleAction()}
        </div>
      </div>
    )
  }

  private renderSubmoduleInfo() {
    // TODO: only for GH submodules?

    const repoIdentifier = parseRepositoryIdentifier(this.props.diff.url)
    if (repoIdentifier === null) {
      return null
    }

    const hostname =
      repoIdentifier.hostname === 'github.com'
        ? ''
        : ` (${repoIdentifier.hostname})`

    return (
      <p>
        <Octicon symbol={OcticonSymbol.info} /> This is a submodule based on the
        repository{' '}
        <LinkButton
          uri={`https://${repoIdentifier.hostname}/${repoIdentifier.owner}/${repoIdentifier.name}`}
        >
          {repoIdentifier.owner}/{repoIdentifier.name}
          {hostname}
        </LinkButton>
        .
      </p>
    )
  }

  private renderCommitChangeInfo() {
    return (
      <p>
        <Octicon symbol={OcticonSymbol.diffModified} /> This submodule has
        changed its commit from <LinkButton>fe158c2</LinkButton> to{' '}
        <LinkButton>0ab36d9</LinkButton>. This change can be committed to the
        parent repository.
      </p>
    )
  }

  private renderSubmodulesChangesInfo() {
    return (
      <p>
        <Octicon symbol={OcticonSymbol.fileDiff} /> This submodule has modified
        and untracked changes. Those changes must be committed inside of the
        submodule before they can be part of the parent repository.
      </p>
    )
  }

  private renderOpenSubmoduleAction() {
    return (
      <SuggestedAction
        title="Open this submodule on GitHub Desktop"
        description="You can open this submodule on GitHub Desktop as a normal repository to manage and commit any changes in it."
        buttonText={__DARWIN__ ? 'Open Repository' : 'Open repository'}
        type="primary"
        onClick={this.onOpenSubmoduleClick}
      />
    )
  }

  private onOpenSubmoduleClick = () => {
    this.props.onOpenSubmodule?.(this.props.diff.fullPath)
  }
}
