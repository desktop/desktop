import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { GitHubRepository } from '../../models/github-repository'
import {
  applyNodeFilters,
  buildCustomMarkDownNodeFilterPipe,
  MarkdownContext,
} from './node-filter'

interface ICustomMarkdownFilterOptions {
  emoji: Map<string, string>
  repository?: GitHubRepository
  markdownContext?: MarkdownContext
}

/**
 * Takes string of markdown and runs it through the MarkedJs parser with github
 * flavored flags enabled followed by running that through domPurify, and lastly
 * if custom markdown options are provided, it applies the custom markdown
 * filters.
 */
export async function parseMarkdown(
  markdown: string,
  customMarkdownOptions?: ICustomMarkdownFilterOptions
) {
  const parsedMarkdown = marked(markdown, {
    // https://marked.js.org/using_advanced  If true, use approved GitHub
    // Flavored Markdown (GFM) specification.
    gfm: true,
    // https://marked.js.org/using_advanced, If true, add <br> on a single
    // line break (copies GitHub behavior on comments, but not on rendered
    // markdown files). Requires gfm be true.
    breaks: true,
  })

  const sanitizedHTML = DOMPurify.sanitize(parsedMarkdown)

  return customMarkdownOptions !== undefined
    ? await applyCustomMarkdownFilters(sanitizedHTML, customMarkdownOptions)
    : sanitizedHTML
}

/**
 * Applies custom markdown filters to parsed markdown html. This is done
 * through converting the markdown html into a DOM document and then
 * traversing the nodes to apply custom filters such as emoji, issue, username
 * mentions, etc.
 */
function applyCustomMarkdownFilters(
  parsedMarkdown: string,
  options: ICustomMarkdownFilterOptions
): Promise<string> {
  const nodeFilters = buildCustomMarkDownNodeFilterPipe(
    options.emoji,
    options.repository,
    options.markdownContext
  )
  return applyNodeFilters(nodeFilters, parsedMarkdown)
}
