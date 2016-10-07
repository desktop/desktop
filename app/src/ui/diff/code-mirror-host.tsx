import * as React from 'react'
import * as CodeMirror from 'codemirror'

CodeMirror.defineMode('github/diff', function(config: CodeMirror.EditorConfiguration, modeOptions?: any) {
  const TOKEN_NAMES = {
    '+': 'diff-add',
    '-': 'diff-delete',
    '@': 'diff-hunk',
  }

  return {
    token: function(stream) {
      const token: any = (TOKEN_NAMES as any)[stream.peek()] || 'diff-context'

      stream.skipToEnd()

      // Use the token to style both the line background and the line content.
      return `line-background-${token} ${token}`
    },
  }
})

interface ICodeMirrorHostProps {
  /**
   * An optional class name for the wrapper element around the
   * CodeMirror component
   */
  className?: string

  /** The text contents for the editor */
  value: string,

  /** Any CodeMirror specific settings */
  options?: CodeMirror.EditorConfiguration

  /** Callback for when CodeMirror renders (or re-renders) a line */
  onRenderLine?: (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => void

  /** Callback for when CodeMirror has completed a batch of changes to the editor */
  onChanges?: (cm: CodeMirror.Editor, change: CodeMirror.EditorChangeLinkedList[]) => void
}

/**
 * A component hosting a CodeMirror instance
 */
export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, void> {

  private wrapper: HTMLDivElement | null
  private codeMirror: CodeMirror.Editor | null

  /**
   * Gets the internal CodeMirror instance or null if CodeMirror hasn't
   * been initialized yet (happens when component mounts)
   */
  public getEditor(): CodeMirror.Editor | null {
    return this.codeMirror
  }

  public componentDidMount() {
    this.codeMirror = CodeMirror(this.wrapper!, this.props.options)

    // The definition for renderLine in DefinitelyTyped is wrong, it says that
    // the line argument is a number when, in fact, it's a LineHandle so we'll
    // opt out of type safety until we can update DefinitelyTyped :cry:
    const cm = this.codeMirror! as any

    cm.on('renderLine', this.onRenderLine)
    cm.on('changes', this.onChanges)

    cm.setValue(this.props.value)
  }

  public componentWillUnmount() {
    // See componentDidMount
    const cm = this.codeMirror as any

    if (cm) {
      cm.off('changes', this.onChanges)
      cm.off('renderLine', this.onRenderLine)

      this.codeMirror = null
    }
  }

  public componentWillReceiveProps(nextProps: ICodeMirrorHostProps) {
    this.codeMirror!.setValue(nextProps.value)
  }

  private onChanges = (cm: CodeMirror.Editor, changes: CodeMirror.EditorChangeLinkedList[]) => {
    if (this.props.onChanges) {
      this.props.onChanges(cm, changes)
    }
  }

  private onRenderLine = (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, element)
    }
  }

  public render() {
    return (
      <div className={this.props.className} ref={(e) => this.wrapper = e}>
      </div>
    )
  }
}
