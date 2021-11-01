import * as React from 'react'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import marked from 'marked'
import DOMPurify from 'dompurify'

interface ISandboxedMarkdownProps {
  /** A string of unparsed markdownm to display */
  readonly markdown: string

  /** The baseHref of the markdown content for when the markdown has relative links */
  readonly baseHref: string | null

  /**
   * A callback with the url of a link clicked in the parsed markdown
   *
   * Note: On a markdown link click, this component attempts to parse the link
   * href as a url and verifies it to be https. If the href fails those tests,
   * this will not fire.
   */
  readonly onMarkdownLinkClicked?: (url: string) => void
}

/**
 * Parses and sanitizes markdown into html and outputs it inside a sandboxed
 * iframe.
 **/
export class SandboxedMarkdown extends React.PureComponent<
  ISandboxedMarkdownProps
> {
  private frameRef: HTMLIFrameElement | null = null

  private onFrameRef = (frameRef: HTMLIFrameElement | null) => {
    this.frameRef = frameRef
  }

  public async componentDidMount() {
    this.mountIframeContents()

    if (this.frameRef !== null) {
      this.setupLinkInterceptor(this.frameRef)
    }
  }

  public async componentDidUpdate(prevProps: ISandboxedMarkdownProps) {
    // rerender iframe contents if provided markdown changes
    if (prevProps.markdown !== this.props.markdown) {
      this.mountIframeContents()
    }
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
    const css = await FSE.readFile(
      Path.join(__dirname, 'static', 'markdown.css'),
      'utf8'
    )

    // scrape theme variables so iframe theme will match app
    const docStyle = getComputedStyle(document.body)
    const textColor = docStyle.getPropertyValue('--text-color')
    const backgroundColor = docStyle.getPropertyValue('--background-color')
    const codeBackgroundColor = docStyle.getPropertyValue(
      '--box-alt-background-color'
    )
    const boxBorderColor = docStyle.getPropertyValue('--box-border-color')

    return `<style>
      :root {
        --text-color: ${textColor};
        --background-color: ${backgroundColor};
        --code-background-color: ${codeBackgroundColor};
        --box-border-color: ${boxBorderColor};
      }
      ${css}
    </style>`
  }

  /**
   * We still want to be able to navigate to links provided in the markdown.
   * However, we want to intercept them an verify they are valid links first.
   */
  private setupLinkInterceptor(frameRef: HTMLIFrameElement): void {
    frameRef.addEventListener('load', () => {
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
    })
  }

  /**
   * Builds a <base> tag for cases where markdown has relative links
   */
  private getBaseTag(baseHref: string | null): string {
    if (baseHref == null) {
      return ''
    }

    const base = document.createElement('base')
    base.href = baseHref
    return base.outerHTML
  }

  /**
   * Populates the mounted iframe with HTML generated from the provided markdown
   */
  private async mountIframeContents() {
    if (this.frameRef === null) {
      return
    }

    const styleSheet = await this.getInlineStyleSheet()

    const parsedMarkdown = marked(this.props.markdown, {
      gfm: true,
    })

    const sanitizedHTML = DOMPurify.sanitize(parsedMarkdown)

    const src = `
      <html>
        <head>
          ${this.getBaseTag(this.props.baseHref)}
          ${styleSheet}
        </head>
        <body>
          ${sanitizedHTML}
        </body>
      </html>
    `

    // We used this `Buffer.toString('base64')` approach because `btoa` could not
    // convert non-latin strings that existed in the markedjs.
    const b64src = Buffer.from(src, 'utf8').toString('base64')

    // We are using `src` and data uri as opposed to an html string in the
    // `srcdoc` property because the `srcdoc` property renders the html in the
    // parent dom and we want all rendering to be isolated to our sandboxed iframe.
    // -- https://csplite.com/csp/test188/
    this.frameRef.src = `data:text/html;charset=utf-8;base64,${b64src}`
  }

  public render() {
    return (
      <iframe
        className="sandboxed-markdown-component"
        sandbox=""
        ref={this.onFrameRef}
      />
    )
  }
}
