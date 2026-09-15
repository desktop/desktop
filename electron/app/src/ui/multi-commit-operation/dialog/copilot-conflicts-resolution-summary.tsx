import * as React from 'react'

import { assertNever } from '../../../lib/fatal-error'
import { Emoji } from '../../../lib/emoji'
import {
  ICopilotResolutionSummary,
  IConflictContextReference,
} from '../../../lib/copilot-conflict-resolution'
import { GitHubRepository } from '../../../models/github-repository'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { CopyButton } from '../../copy-button'
import { SandboxedMarkdown } from '../../lib/sandboxed-markdown'
import { LinkButton } from '../../lib/link-button'
import { Ref } from '../../lib/ref'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'

interface ICopilotConflictsResolutionSummaryProps {
  readonly summary: ICopilotResolutionSummary
  readonly operationKind: MultiCommitOperationKind
  readonly emoji: Map<string, Emoji>
  readonly gitHubRepository: GitHubRepository | null
  readonly onMarkdownLinkClicked: (url: string) => void
}

/**
 * Builds the operation subheading — e.g. "Merging Feature-A into
 * Feature-B" — with branch names wrapped in `<Ref>` for consistent
 * styling across the app.
 */
function getOperationPhrase(
  kind: MultiCommitOperationKind,
  ourLabel: string,
  theirLabel: string
): JSX.Element {
  switch (kind) {
    case MultiCommitOperationKind.Merge:
      return (
        <span>
          Merging <Ref>{theirLabel}</Ref> into <Ref>{ourLabel}</Ref>
        </span>
      )
    case MultiCommitOperationKind.Rebase:
      return (
        <span>
          Rebasing <Ref>{ourLabel}</Ref> onto <Ref>{theirLabel}</Ref>
        </span>
      )
    case MultiCommitOperationKind.CherryPick:
      return (
        <span>
          Cherry-picking from <Ref>{theirLabel}</Ref> into <Ref>{ourLabel}</Ref>
        </span>
      )
    case MultiCommitOperationKind.Squash:
      return (
        <span>
          Squashing into <Ref>{ourLabel}</Ref>
        </span>
      )
    case MultiCommitOperationKind.Reorder:
      return (
        <span>
          Reordering <Ref>{ourLabel}</Ref>
        </span>
      )
    default:
      return assertNever(kind, `Unknown operation kind: ${kind}`)
  }
}

/**
 * Custom CSS injected into the SandboxedMarkdown iframe to make headings
 * match the surrounding summary card rather than using full-size GFM styles.
 */
const summaryMarkdownCSS = `
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    font-size: 1em;
    margin-top: 0.75em;
    margin-bottom: 0.25em;
    padding-bottom: 0;
    border-bottom: none;
  }

  .markdown-body h1:first-child,
  .markdown-body h2:first-child,
  .markdown-body h3:first-child,
  .markdown-body h4:first-child,
  .markdown-body h5:first-child,
  .markdown-body h6:first-child {
    margin-top: 0;
  }

  .markdown-body p:last-child {
    margin-bottom: 0;
  }
`

/**
 * The Copilot resolution summary card rendered at the top of the conflict
 * resolution dialog. Combines a deterministic title, the model-authored
 * markdown body, and a Desktop-rendered references block with real links
 * to PRs and commits.
 */
export class CopilotConflictsResolutionSummary extends React.Component<ICopilotConflictsResolutionSummaryProps> {
  public render() {
    const { summary, operationKind } = this.props
    const phrase = getOperationPhrase(
      operationKind,
      summary.ourLabel,
      summary.theirLabel
    )

    return (
      <div className="copilot-conflicts-summary">
        <h2 className="copilot-conflicts-summary-theme">
          <Octicon
            symbol={octicons.copilot}
            className="copilot-conflicts-summary-copilot-icon"
          />
          <span className="copilot-conflicts-summary-theme-label">
            Resolution summary
          </span>
        </h2>
        <div className="copilot-conflicts-summary-body">
          <p className="copilot-conflicts-summary-operation">{phrase}</p>
          {this.renderMarkdownBody()}
          {this.renderReferences()}
        </div>
      </div>
    )
  }

  private renderMarkdownBody(): JSX.Element | null {
    const { markdown } = this.props.summary
    if (markdown === null || markdown.trim() === '') {
      return null
    }

    return (
      <div className="copilot-conflicts-summary-markdown">
        <SandboxedMarkdown
          markdown={markdown}
          emoji={this.props.emoji}
          repository={this.props.gitHubRepository ?? undefined}
          onMarkdownLinkClicked={this.props.onMarkdownLinkClicked}
          underlineLinks={true}
          ariaLabel="Copilot conflict resolution summary"
          customCSS={summaryMarkdownCSS}
        />
      </div>
    )
  }

  private renderReferences(): JSX.Element | null {
    const { references } = this.props.summary
    if (references.length === 0) {
      return null
    }

    return (
      <div className="copilot-conflicts-summary-references">
        <h3 className="copilot-conflicts-summary-references-title">Context</h3>
        <ul className="copilot-conflicts-summary-reference-list">
          {references.map((ref, i) => (
            <li
              key={`${ref.kind}-${i}`}
              className="copilot-conflicts-summary-reference-item"
            >
              {renderReference(ref, this.props.gitHubRepository)}
            </li>
          ))}
        </ul>
      </div>
    )
  }
}

function buildPullRequestUrl(
  gitHubRepository: GitHubRepository | null,
  prNumber: number
): string | null {
  const base = gitHubRepository?.htmlURL ?? null
  return base !== null ? `${base}/pull/${prNumber}` : null
}

function buildCommitUrl(
  gitHubRepository: GitHubRepository | null,
  sha: string
): string | null {
  const base = gitHubRepository?.htmlURL ?? null
  return base !== null ? `${base}/commit/${sha}` : null
}

/**
 * Render a reference title as a link when we have a URL, or as plain
 * text otherwise.
 */
function renderTitle(text: string, url: string | null): JSX.Element {
  if (url === null) {
    return (
      <span className="copilot-conflicts-summary-reference-title">{text}</span>
    )
  }
  return (
    <LinkButton uri={url} className="copilot-conflicts-summary-reference-title">
      {text}
    </LinkButton>
  )
}

function renderReference(
  ref: IConflictContextReference,
  gitHubRepository: GitHubRepository | null
): JSX.Element {
  switch (ref.kind) {
    case 'pullRequest':
      return (
        <>
          <Octicon
            symbol={octicons.gitPullRequest}
            className="copilot-conflicts-summary-reference-icon"
          />
          {renderTitle(
            ref.pullRequest.title,
            buildPullRequestUrl(gitHubRepository, ref.pullRequest.number)
          )}
          <span className="copilot-conflicts-summary-reference-id">
            #{ref.pullRequest.number}
          </span>
        </>
      )

    case 'commit':
      return (
        <>
          <Octicon
            symbol={octicons.gitCommit}
            className="copilot-conflicts-summary-reference-icon"
          />
          {renderTitle(
            ref.commit.summary,
            ref.commit.isOnRemote
              ? buildCommitUrl(gitHubRepository, ref.commit.sha)
              : null
          )}
          <span className="copilot-conflicts-summary-reference-commit-ref">
            <span className="ref selectable">{ref.commit.shortSha}</span>
            <CopyButton
              ariaLabel="Copy the full SHA"
              copyContent={ref.commit.sha}
            />
          </span>
          {!ref.commit.isOnRemote && (
            <span className="copilot-conflicts-summary-reference-tag">
              local only
            </span>
          )}
        </>
      )
    default:
      return assertNever(ref, `Unknown reference kind: ${ref}`)
  }
}
