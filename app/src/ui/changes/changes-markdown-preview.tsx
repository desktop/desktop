import * as React from 'react'
import * as Path from 'path'
import { readFile } from 'fs/promises'

import { Emoji } from '../../lib/emoji'
import { Repository } from '../../models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { Dispatcher } from '../dispatcher'
import { pathExists } from '../lib/path-exists'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'

const PreviewLoadingMessage = 'Loading preview…'
const PreviewDeletedFileMessage = 'Preview is not available for deleted files.'
const PreviewFileNotFoundMessage = 'File not found on disk.'
const PreviewReadErrorMessage = 'Could not read this file.'

interface IChangesMarkdownPreviewProps {
  readonly repository: Repository
  readonly file: WorkingDirectoryFileChange
  readonly emoji: Map<string, Emoji>
  readonly underlineLinks: boolean
  readonly dispatcher: Dispatcher
}

interface IChangesMarkdownPreviewState {
  readonly markdown: string | null
  readonly error: string | null
  readonly loading: boolean
}

export class ChangesMarkdownPreview extends React.Component<
  IChangesMarkdownPreviewProps,
  IChangesMarkdownPreviewState
> {
  public constructor(props: IChangesMarkdownPreviewProps) {
    super(props)
    this.state = {
      markdown: null,
      error: null,
      loading: true,
    }
  }

  public componentDidMount() {
    this.loadMarkdown()
  }

  public componentDidUpdate(prevProps: IChangesMarkdownPreviewProps) {
    if (
      prevProps.file.path !== this.props.file.path ||
      prevProps.file.id !== this.props.file.id
    ) {
      this.setState({ markdown: null, error: null, loading: true }, () =>
        this.loadMarkdown()
      )
    }
  }

  private loadMarkdown = async () => {
    const { repository, file } = this.props

    if (file.status.kind === AppFileStatusKind.Deleted) {
      this.setState({
        markdown: null,
        error: PreviewDeletedFileMessage,
        loading: false,
      })
      return
    }

    const fullPath = Path.join(repository.path, file.path)
    if (!(await pathExists(fullPath))) {
      this.setState({
        markdown: null,
        error: PreviewFileNotFoundMessage,
        loading: false,
      })
      return
    }

    try {
      const text = await readFile(fullPath, 'utf8')
      this.setState({ markdown: text, error: null, loading: false })
    } catch {
      this.setState({
        markdown: null,
        error: PreviewReadErrorMessage,
        loading: false,
      })
    }
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  public render() {
    const { repository, emoji, underlineLinks } = this.props
    const { markdown, error, loading } = this.state

    if (loading) {
      return (
        <div className="changes-markdown-preview changes-markdown-preview--loading">
          {PreviewLoadingMessage}
        </div>
      )
    }

    if (error !== null) {
      return (
        <div className="changes-markdown-preview changes-markdown-preview--error">
          {error}
        </div>
      )
    }

    if (markdown === null) {
      return null
    }

    return (
      <div className="changes-markdown-preview">
        <SandboxedMarkdown
          markdown={markdown}
          emoji={emoji}
          baseHref={repository.gitHubRepository?.htmlURL ?? undefined}
          repository={repository.gitHubRepository ?? undefined}
          markdownContext="Commit"
          onMarkdownLinkClicked={this.onMarkdownLinkClicked}
          underlineLinks={underlineLinks}
          ariaLabel="Rendered Markdown preview of the selected file"
        />
      </div>
    )
  }
}
