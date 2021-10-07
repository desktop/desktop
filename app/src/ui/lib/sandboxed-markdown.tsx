import * as React from 'react'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import crypto from 'crypto'

interface ISandboxedMarkdownProps {
  /** A string of unparsed markdownm to display */
  readonly markdown: string
}

/**
 * Parses markdown into html and outputs it inside a sandboxed iframe.
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
  }

  public async componentDidUpdate(prevProps: ISandboxedMarkdownProps) {
    // rerender iframe contents if provided markdown changes
    if (prevProps.markdown !== this.props.markdown) {
      this.mountIframeContents()
    }
  }

  private mountIframeContents = async (): Promise<void> => {
    if (this.frameRef === null || this.frameRef.contentDocument === null) {
      return
    }

    const markedJS = await FSE.readFile(
      Path.join(__dirname, 'static', 'marked.min.js'),
      'utf8'
    )

    const css = await FSE.readFile(
      Path.join(__dirname, 'static', 'markdown.css'),
      'utf8'
    )

    // Prevents any script without the generated nonce (number used once)
    const nonce = crypto.randomBytes(16).toString('base64')
    const contentSecurityPolicy = `script-src 'nonce-${nonce}'`

    // get colors
    const textColor = 'black'
    const backgroundColor = 'white'
    const codeBackgroundColor = 'rgb(110 118 129 / 40%)'
    const boxBorderColor = 'grey'

    const testEvilScript = `<script>
    console.log("this one fails.. not csp")
  </script>
   `

    this.frameRef.srcdoc = `
    <meta http-equiv="Content-Security-Policy"
      content="${contentSecurityPolicy}">

    <style>
      :root {
        --text-color: ${textColor};
        --background-color: ${backgroundColor};
        --code-background-color: ${codeBackgroundColor};
        --box-border-color: ${boxBorderColor};
      }

      ${css}
    </style>

    <div id="content">

    </div>

    <script nonce="${nonce}">
      ${markedJS}

      var md = atob('${btoa(this.props.markdown)}');
      marked.use({
        gfm: true
      });
      var parsed = marked(md);
      document.getElementById('content').innerHTML = parsed;

      document.querySelector('a').addEventListener('click', e => {
        e.preventDefault();
        window.parent.postMessage(e.toString());
      })
    </script>

    ${testEvilScript}
    `

    window.addEventListener(
      'message',
      event => {
        console.log(event)
      },
      false
    )
  }

  public render() {
    return (
      <iframe
        className="markdown-iframe"
        sandbox="allow-scripts allow-same-origin"
        ref={this.onFrameRef}
      />
    )
  }
}
