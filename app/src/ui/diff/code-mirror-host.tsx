import * as React from 'react'
import * as CodeMirror from 'codemirror'

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

  /** Callback for diff to control whether selection is enabled */
  isSelectionEnabled?: () => boolean

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
    cm.on('beforeSelectionChange', this.beforeSelectionChanged)

    cm.setValue(this.props.value)
  }

  public componentWillUnmount() {
    // See componentDidMount
    const cm = this.codeMirror as any

    if (cm) {
      cm.off('changes', this.onChanges)
      cm.off('renderLine', this.onRenderLine)
      cm.off('beforeSelectionChange', this.beforeSelectionChanged)

      this.codeMirror = null
    }
  }

  public componentWillReceiveProps(nextProps: ICodeMirrorHostProps) {
    this.codeMirror!.setValue(nextProps.value)
  }

  private beforeSelectionChanged = (cm: CodeMirror.Editor, changeObj: any) => {
    if (this.props.isSelectionEnabled) {
      if (!this.props.isSelectionEnabled()) {
        // ignore whatever the user has currently selected, pass in a
        // "nothing selected" value
        // NOTE:
        // - `head` is the part of the selection that is moving
        // - `anchor` is the other end
        changeObj.update([ { head: { line: 0, ch: 0 } , anchor: { line: 0, ch: 0 } } ])
      }
    }
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
