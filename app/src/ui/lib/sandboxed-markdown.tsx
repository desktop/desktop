import * as React from 'react'
import * as Path from 'path'
import { MarkdownContext } from '../../lib/markdown-filters/node-filter'
import { GitHubRepository } from '../../models/github-repository'
import { readFile } from 'fs/promises'
import { Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'
import { getObjectId } from './object-id'
import debounce from 'lodash/debounce'
import {
  MarkdownEmitter,
  parseMarkdown,
} from '../../lib/markdown-filters/markdown-filter'
import { Emoji } from '../../lib/emoji'

interface ISandboxedMarkdownProps {
  /** A string of unparsed markdown to display */
  readonly markdown: string | MarkdownEmitter

  /** The baseHref of the markdown content for when the markdown has relative links */
  readonly baseHref?: string

  /**
   * A callback with the url of a link clicked in the parsed markdown
   *
   * Note: On a markdown link click, this component attempts to parse the link
   * href as a url and verifies it to be https. If the href fails those tests,
   * this will not fire.
   */
  readonly onMarkdownLinkClicked?: (url: string) => void

  /** A callback for after the markdown has been parsed and the contents have
   * been mounted to the iframe */
  readonly onMarkdownParsed?: () => void

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  /** The GitHub repository for some markdown filters such as issue and commits. */
  readonly repository?: GitHubRepository

  /** The context of which markdown resides - such as PullRequest, PullRequestComment, Commit */
  readonly markdownContext?: MarkdownContext

  readonly underlineLinks: boolean

  /** An area label to explain to screen reader users what the contents of the
   * iframe are before they navigate into them. */
  readonly ariaLabel: string
}

interface ISandboxedMarkdownState {
  readonly tooltipElements: ReadonlyArray<HTMLElement>
  readonly tooltipOffset?: DOMRect
}

/**
 * Parses and sanitizes markdown into html and outputs it inside a sandboxed
 * iframe.
 **/
export class SandboxedMarkdown extends React.PureComponent<
  ISandboxedMarkdownProps,
  ISandboxedMarkdownState
> {
  private frameRef: HTMLIFrameElement | null = null
  private frameContainingDivRef: HTMLDivElement | null = null
  private contentDivRef: HTMLDivElement | null = null
  private markdownEmitter?: MarkdownEmitter

  /**
   * Resize observer used for tracking height changes in the markdown
   * content and update the size of the iframe container.
   */
  private readonly resizeObserver: ResizeObserver
  private resizeDebounceId: number | null = null

  private onDocumentScroll = debounce(() => {
    this.setState({
      tooltipOffset: this.frameRef?.getBoundingClientRect() ?? new DOMRect(),
    })
  }, 100)

  /**
   * We debounce the markdown updating because it is updated on each custom
   * markdown filter. Leading is true so that users will at a minimum see the
   * markdown parsed by markedjs while the custom filters are being applied.
   * (So instead of being updated, 10+ times it is updated 1 or 2 times.)
   */
  private onMarkdownUpdated = debounce(
    markdown => this.mountIframeContents(markdown),
    10,
    { leading: true }
  )

  public constructor(props: ISandboxedMarkdownProps) {
    super(props)

    this.resizeObserver = new ResizeObserver(this.scheduleResizeEvent)
    this.state = { tooltipElements: [] }
  }

  private scheduleResizeEvent = () => {
    if (this.resizeDebounceId !== null) {
      cancelAnimationFrame(this.resizeDebounceId)
      this.resizeDebounceId = null
    }
    this.resizeDebounceId = requestAnimationFrame(this.onContentResized)
  }

  private onContentResized = () => {
    if (this.frameRef === null) {
      return
    }

    this.setFrameContainerHeight(this.frameRef)
  }

  private onFrameRef = (frameRef: HTMLIFrameElement | null) => {
    this.frameRef = frameRef
  }

  private onFrameContainingDivRef = (
    frameContainingDivRef: HTMLIFrameElement | null
  ) => {
    this.frameContainingDivRef = frameContainingDivRef
  }

  private initializeMarkdownEmitter = () => {
    if (this.markdownEmitter !== undefined) {
      this.markdownEmitter.dispose()
    }
    const { emoji, repository, markdownContext } = this.props
    this.markdownEmitter =
      typeof this.props.markdown !== 'string'
        ? this.props.markdown
        : parseMarkdown(this.props.markdown, {
            emoji,
            repository,
            markdownContext,
          })

    this.markdownEmitter.onMarkdownUpdated((markdown: string) => {
      this.onMarkdownUpdated(markdown)
    })
  }

  public async componentDidMount() {
    this.initializeMarkdownEmitter()

    if (this.frameRef !== null) {
      this.setupFrameLoadListeners(this.frameRef)
    }

    document.addEventListener('scroll', this.onDocumentScroll, {
      capture: true,
    })
  }

  public async componentDidUpdate(prevProps: ISandboxedMarkdownProps) {
    // rerender iframe contents if provided markdown changes
    if (prevProps.markdown !== this.props.markdown) {
      this.initializeMarkdownEmitter()
    }
  }

  public componentWillUnmount() {
    this.markdownEmitter?.dispose()
    this.resizeObserver.disconnect()
    document.removeEventListener('scroll', this.onDocumentScroll)
  }

  /**
   * Since iframe styles are isolated from the rest of the app, we have a
   * markdown.css file that we added to app/static directory that we can read in
   * and provide to the iframe.
   *
   * Additionally, the iframe will not be aware of light/dark theme variables,
   * thus we will scrape the subset of them needed for the markdown css from the
   * document body and provide them aswell.
   */
  private async getInlineStyleSheet(): Promise<string> {
    const css = await readFile(
      Path.join(__dirname, 'static', 'markdown.css'),
      'utf8'
    )

    // scrape theme variables so iframe theme will match app
    const docStyle = getComputedStyle(document.body)

    function scrapeVariable(variableName: string): string {
      return `${variableName}: ${docStyle.getPropertyValue(variableName)};`
    }

    return `<style>
      :root {
        ${scrapeVariable('--md-border-default-color')}
        ${scrapeVariable('--md-border-muted-color')}
        ${scrapeVariable('--md-canvas-default-color')}
        ${scrapeVariable('--md-canvas-subtle-color')}
        ${scrapeVariable('--md-fg-default-color')}
        ${scrapeVariable('--md-fg-muted-color')}
        ${scrapeVariable('--md-danger-fg-color')}
        ${scrapeVariable('--md-neutral-muted-color')}
        ${scrapeVariable('--md-accent-emphasis-color')}
        ${scrapeVariable('--md-accent-fg-color')}

        ${scrapeVariable('--font-size')}
        ${scrapeVariable('--font-size-sm')}
        ${scrapeVariable('--text-color')}
        ${scrapeVariable('--background-color')}
      }

      ${css}

      .markdown-body a {
        text-decoration: ${this.props.underlineLinks ? 'underline' : 'inherit'};
      }
    </style>`
  }

  /**
   * We still want to be able to navigate to links provided in the markdown.
   * However, we want to intercept them an verify they are valid links first.
   */
  private setupFrameLoadListeners(frameRef: HTMLIFrameElement): void {
    frameRef.addEventListener('load', () => {
      this.setupContentDivRef(frameRef)
      this.setupLinkInterceptor(frameRef)
      this.setupTooltips(frameRef)
      this.setFrameContainerHeight(frameRef)
    })
  }

  private setupTooltips(frameRef: HTMLIFrameElement) {
    if (frameRef.contentDocument === null) {
      return
    }

    const tooltipElements = new Array<HTMLElement>()

    for (const e of frameRef.contentDocument.querySelectorAll('[aria-label]')) {
      if (frameRef.contentWindow?.HTMLElement) {
        if (e instanceof frameRef.contentWindow.HTMLElement) {
          tooltipElements.push(e)
        }
      }
    }

    this.setState({
      tooltipElements,
      tooltipOffset: frameRef.getBoundingClientRect(),
    })
  }

  private setupContentDivRef(frameRef: HTMLIFrameElement): void {
    if (frameRef.contentDocument === null) {
      return
    }

    /*
     * We added an additional wrapper div#content around the markdown to
     * determine a more accurate scroll height as the iframe's document or body
     * element was not adjusting it's height dynamically when new content was
     * provided.
     */
    this.contentDivRef = frameRef.contentDocument.documentElement.querySelector(
      '#content'
    ) as HTMLDivElement

    if (this.contentDivRef !== null) {
      this.resizeObserver.disconnect()
      this.resizeObserver.observe(this.contentDivRef)
    }
  }

  /**
   * Iframes without much styling help will act like a block element that has a
   * predetermiend height and width and scrolling. We want our iframe to feel a
   * bit more like a div. Thus, we want to capture the scroll height, and set
   * the container div to that height and with some additional css we can
   * achieve a inline feel.
   */
  private setFrameContainerHeight(frameRef: HTMLIFrameElement): void {
    if (
      frameRef.contentDocument === null ||
      this.frameContainingDivRef === null ||
      this.contentDivRef === null
    ) {
      return
    }

    // Not sure why the content height != body height exactly. But we need to
    // set the height explicitly to prevent scrollbar/content cut off.
    // HACK: Add 1 to the new height to avoid UI glitches like the one shown
    // in https://github.com/desktop/desktop/pull/18596
    const divHeight = this.contentDivRef.clientHeight
    this.frameContainingDivRef.style.height = `${divHeight + 1}px`
    this.props.onMarkdownParsed?.()
  }

  /**
   * We still want to be able to navigate to links provided in the markdown.
   * However, we want to intercept them an verify they are valid links first.
   */
  private setupLinkInterceptor(frameRef: HTMLIFrameElement): void {
    frameRef.contentDocument?.addEventListener('click', ev => {
      const { contentWindow } = frameRef

      if (contentWindow && ev.target instanceof contentWindow.Element) {
        const a = ev.target.closest('a')
        if (a !== null) {
          ev.preventDefault()

          if (/^https?:/.test(a.protocol)) {
            this.props.onMarkdownLinkClicked?.(a.href)
          }
        }
      }
    })
  }

  /**
   * Builds a <base> tag for cases where markdown has relative links
   */
  private getBaseTag(baseHref?: string): string {
    if (baseHref === undefined) {
      return ''
    }

    const base = document.createElement('base')
    base.href = baseHref
    return base.outerHTML
  }

  /**
   * Populates the mounted iframe with HTML generated from the provided markdown
   */
  private async mountIframeContents(markdown: string) {
    if (this.frameRef === null) {
      return
    }

    const styleSheet = await this.getInlineStyleSheet()

    const src = `
      <html>
        <head>
          ${this.getBaseTag(this.props.baseHref)}
          ${styleSheet}
        </head>
        <body class="markdown-body">
          <div id="content">
          ${markdown}
          </div>
        </body>
      </html>
    `

    // We used this `Buffer.toString('base64')` approach because `btoa` could not
    // convert non-latin strings that existed in the markedjs.
    const b64src = Buffer.from(src, 'utf8').toString('base64')

    if (this.frameRef === null) {
      // If frame is destroyed before markdown parsing completes, frameref will be null.
      return
    }

    // We are using `src` and data uri as opposed to an html string in the
    // `srcdoc` property because the `srcdoc` property renders the html in the
    // parent dom and we want all rendering to be isolated to our sandboxed iframe.
    // -- https://csplite.com/csp/test188/
    this.frameRef.src = `data:text/html;charset=utf-8;base64,${b64src}`
  }

  public render() {
    const { tooltipElements, tooltipOffset } = this.state

    return (
      <div
        className="sandboxed-markdown-iframe-container"
        ref={this.onFrameContainingDivRef}
      >
        <iframe
          title="sandboxed-markdown-component"
          className="sandboxed-markdown-component"
          sandbox=""
          ref={this.onFrameRef}
          aria-label={this.props.ariaLabel}
        />
        {tooltipElements.map(e => (
          <Tooltip
            target={createObservableRef(e)}
            key={getObjectId(e)}
            tooltipOffset={tooltipOffset}
          >
            {e.ariaLabel}
          </Tooltip>
        ))}
      </div>
    )
  }
}
