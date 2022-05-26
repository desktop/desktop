import DOMPurify from 'dompurify'
import { Disposable, Emitter } from 'event-kit'
import { marked } from 'marked'
import {
  applyNodeFilters,
  buildCustomMarkDownNodeFilterPipe,
  ICustomMarkdownFilterOptions,
} from './node-filter'

/**
 * The MarkdownEmitter extends the Emitter functionality to be able to keep
 * track of the last emitted value and return it upon subscription.
 */
export class MarkdownEmitter extends Emitter {
  public constructor(private markdown: null | string = null) {
    super()
  }

  public onMarkdownUpdated(handler: (value: string) => void): Disposable {
    if (this.markdown !== null) {
      handler(this.markdown)
    }
    return super.on('markdown', handler)
  }

  public emit(value: string): void {
    this.markdown = value
    super.emit('markdown', value)
  }

  public get latestMarkdown() {
    return this.markdown
  }
}

/**
 * Takes string of markdown and runs it through the MarkedJs parser with github
 * flavored flags followed by sanitization with domPurify.
 *
 * If custom markdown options are provided, it applies the custom markdown
 * filters.
 *
 * Rely `repository` custom markdown option:
 * - TeamMentionFilter
 * - MentionFilter
 * - CommitMentionFilter
 * - CommitMentionLinkFilter
 *
 * Rely `markdownContext` custom markdown option:
 * - IssueMentionFilter
 * - IssueLinkFilter
 * - CloseKeyWordFilter
 */
export function parseMarkdown(
  markdown: string,
  customMarkdownOptions?: ICustomMarkdownFilterOptions
): MarkdownEmitter {
  const parsedMarkdown = marked(markdown, {
    // https://marked.js.org/using_advanced  If true, use approved GitHub
    // Flavored Markdown (GFM) specification.
    gfm: true,
    // https://marked.js.org/using_advanced, If true, add <br> on a single
    // line break (copies GitHub behavior on comments, but not on rendered
    // markdown files). Requires gfm be true.
    breaks: true,
  })

  const sanitizedMarkdown = DOMPurify.sanitize(parsedMarkdown)
  const markdownEmitter = new MarkdownEmitter(sanitizedMarkdown)

  if (customMarkdownOptions !== undefined) {
    applyCustomMarkdownFilters(markdownEmitter, customMarkdownOptions)
  }

  return markdownEmitter
}

/**
 * Applies custom markdown filters to parsed markdown html. This is done
 * through converting the markdown html into a DOM document and then
 * traversing the nodes to apply custom filters such as emoji, issue, username
 * mentions, etc. (Expects a markdownEmitter with an initial markdown value)
 */
function applyCustomMarkdownFilters(
  markdownEmitter: MarkdownEmitter,
  options: ICustomMarkdownFilterOptions
): void {
  const nodeFilters = buildCustomMarkDownNodeFilterPipe(options)
  applyNodeFilters(nodeFilters, markdownEmitter)
}
