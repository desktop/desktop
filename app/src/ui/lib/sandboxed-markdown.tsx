import * as React from 'react'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import crypto from 'crypto'

interface ISandboxedMarkdownProps {
  /** A string of unparsed markdownm to display */
  readonly markdown: string

  /** The baseHref of the markdown content */
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
 * Parses markdown into html and outputs it inside a sandboxed iframe.
 **/
export class SandboxedMarkdown extends React.PureComponent<
  ISandboxedMarkdownProps
> {
  private frameRef: HTMLIFrameElement | null = null
  /**
   * A random string to use a unique script id or number only once (nonce) so
   * the content security policy will only allow our provided script in the
   * iframe to run.
   */
  private scriptNonce: string = crypto.randomBytes(16).toString('base64')

  private onFrameRef = (frameRef: HTMLIFrameElement | null) => {
    this.frameRef = frameRef
  }

  public async componentDidMount() {
    this.mountIframeContents()
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
   * Gets a content security policy that only allows a script with the provided
   * nonce to run in the iframe.
   */
  private setContentSecurityPolicy(frameRef: HTMLIFrameElement): void {
    const contentSecurityPolicy = `script-src 'nonce-${this.scriptNonce}'`
    frameRef.setAttribute('csp', contentSecurityPolicy)
  }

  /**
   * We still want to be able to navigate to links provided in the markdown.
   * However, we want to intercept them an verify they are valid links first.
   */
  private setupLinkInterceptor(frameRef: HTMLIFrameElement): void {
    frameRef.onload = () => {
      if (frameRef.contentDocument === null) {
        return
      }
      const linkTags = frameRef.contentDocument.querySelector('a')
      if (linkTags === null) {
        return
      }

      linkTags.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault()
        // The point of intercepting them is to bubble them up.
        // If no callback provided, no need to continue.
        if (this.props.onMarkdownLinkClicked === undefined) {
          return
        }

        if (e.target === null) {
          log.warn('Failed to parse markdown link href')
          return
        }

        let url
        try {
          const href = (e.target as HTMLAnchorElement).href
          url = new URL(href)
        } catch (_) {
          log.warn('Failed to parse markdown link href')
          return
        }

        // TODO: Our markdown parser may need expanded for better gfm support or
        // some of our own parsing on top... seems github.com may be doing this (see all the filters listed..)
        // - https://github.com/github/github/blob/c64a19a5173834d776cc67f21fd7cf141e5fd2ab/lib/github/goomba.rb#L129.
        // But as it is, there are links provided that look like:
        // "/desktop/desktop/security/code-scanning?query=pr%3A13013+tool%3ACodeQL"
        // The expectation is that his should open
        // github.com/desktop/desktop/security/code-scanning?query=pr%3A13013+tool%3ACodeQL
        if (url.protocol !== 'https:') {
          log.warn(
            'Failed to parse markdown link href - non https: links are blocked'
          )
          return
        }

        this.props.onMarkdownLinkClicked(url.toString())
      })
    }
  }

  /**
   * Generates an iframe with a csp allowed script of a markdown parser.
   */
  private mountIframeContents = async (): Promise<void> => {
    if (this.frameRef === null) {
      return
    }

    const markedJS = await FSE.readFile(
      Path.join(__dirname, 'static', 'marked.min.js'),
      'utf8'
    )

    const styleSheet = await this.getInlineStyleSheet()
    this.setContentSecurityPolicy(this.frameRef)

    // We need to convert the markdown into a base64 string to allow us to print
    // it into a script file and not break into multiple lines. Then, in the
    // script file, we need to convert it back to a markdown string.
    // encodeURIComponent/decodeURIComponent is important for things like emoji
    // unicode and btoa fails to parse non latin strings.
    const mardownToAndFromBase64 = `var md = decodeURIComponent(atob('${btoa(
      encodeURIComponent(this.props.markdown)
    )}'));`

    // We want the marked parse to use GitHub Flavored Markdown (gfm)
    const useGFM = `marked.use({
                      gfm: true
                    });`

    const src = `
      <html>
      <head>
        ${
          this.props.baseHref !== null
            ? `<base href="${this.props.baseHref}" />`
            : ''
        }
      </head>
      <body>
      ${styleSheet}

      <div id="content"></div>

      <script nonce="${this.scriptNonce}">
        ${markedJS}
        ${mardownToAndFromBase64}
        ${useGFM}
        document.getElementById('content').innerHTML = marked(md);
      </script>
      </body>
      </html>
    `

    // We used this `Buffer.toString('base64')` approach because `btoa` could not
    // convert non-latin strings that existed in the markedjs.
    const b64src = Buffer.from(src, 'utf8').toString('base64')

    // We are using `src` and data uri as opposed to an html string in the
    // `srcdoc` property because the `srcdoc` property renders the html in the
    // parent dom and therefore does not utilize the content security policy
    // provided in the iframe's csp attribute. Additionally, we want all rendering
    // to be isolated to our sandboxed iframe - not in the parents dom.
    // -- https://csplite.com/csp/test188/
    this.frameRef.src = `data:text/html;charset=utf-8;base64,${b64src}`
    this.setupLinkInterceptor(this.frameRef)
  }

  public render() {
    return (
      <iframe
        className="markdown-iframe"
        sandbox="allow-scripts"
        ref={this.onFrameRef}
      />
    )
  }
}
