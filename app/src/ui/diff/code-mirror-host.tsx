import * as React from 'react'
import * as CodeMirror from 'codemirror'

// Required for us to be able to customize the foreground color of selected text
import 'codemirror/addon/selection/mark-selection'

// Autocompletion plugin
import 'codemirror/addon/hint/show-hint'

if (__DARWIN__) {
  // This has to be required to support the `simple` scrollbar style.
  require('codemirror/addon/scroll/simplescrollbars')
}

interface ICodeMirrorHostProps {
  /**
   * An optional class name for the wrapper element around the
   * CodeMirror component
   */
  readonly className?: string

  /** The text contents for the editor */
  readonly value: string

  /** Any CodeMirror specific settings */
  readonly options?: CodeMirror.EditorConfiguration

  /** Callback for diff to control whether selection is enabled */
  readonly isSelectionEnabled?: () => boolean

  /** Callback for when CodeMirror renders (or re-renders) a line */
  readonly onRenderLine?: (
    cm: CodeMirror.Editor,
    line: CodeMirror.LineHandle,
    element: HTMLElement
  ) => void

  /** Callback for when CodeMirror has completed a batch of changes to the editor */
  readonly onChanges?: (
    cm: CodeMirror.Editor,
    change: CodeMirror.EditorChangeLinkedList[]
  ) => void

  readonly onViewportChange?: (
    cm: CodeMirror.Editor,
    from: number,
    to: number
  ) => void

  /**
   * Called when content has been copied. The default behavior may be prevented
   * by calling `preventDefault` on the event.
   */
  readonly onCopy?: (editor: CodeMirror.Editor, event: Event) => void
}

/**
 * A component hosting a CodeMirror instance
 */
export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, {}> {
  private wrapper: HTMLDivElement | null = null
  private codeMirror: CodeMirror.Editor | null = null

  /**
   * Gets the internal CodeMirror instance or null if CodeMirror hasn't
   * been initialized yet (happens when component mounts)
   */
  public getEditor(): CodeMirror.Editor | null {
    return this.codeMirror
  }

  public componentDidMount() {
    this.codeMirror = CodeMirror(this.wrapper!, this.props.options)

    this.codeMirror.on('renderLine', this.onRenderLine)
    this.codeMirror.on('changes', this.onChanges)
    this.codeMirror.on('viewportChange', this.onViewportChange)
    this.codeMirror.on('beforeSelectionChange', this.beforeSelectionChanged)
    this.codeMirror.on('copy', this.onCopy)

    this.codeMirror.setValue(this.props.value)
  }

  private onCopy = (instance: CodeMirror.Editor, event: Event) => {
    if (this.props.onCopy) {
      this.props.onCopy(instance, event)
    }
  }

  public componentWillUnmount() {
    const cm = this.codeMirror

    if (cm) {
      cm.off('changes', this.onChanges)
      cm.off('viewportChange', this.onViewportChange)
      cm.off('renderLine', this.onRenderLine)
      cm.off('beforeSelectionChange', this.beforeSelectionChanged)
      cm.off('copy', this.onCopy as any)

      this.codeMirror = null
    }
  }

  public componentWillReceiveProps(nextProps: ICodeMirrorHostProps) {
    if (this.props.value !== nextProps.value) {
      this.codeMirror!.setValue(nextProps.value)
    }
  }

  public shouldComponentUpdate(nextProps: ICodeMirrorHostProps) {
    // NB This is the only time we actually have to re-render.
    // Updating of values is done in componentWillReceiveProps,
    // all event handlers are marshalled through private non-changing
    // wrappers.
    return nextProps.className !== this.props.className
  }

  private beforeSelectionChanged = (cm: CodeMirror.Editor, changeObj: any) => {
    if (this.props.isSelectionEnabled) {
      if (!this.props.isSelectionEnabled()) {
        // ignore whatever the user has currently selected, pass in a
        // "nothing selected" value
        // NOTE:
        // - `head` is the part of the selection that is moving
        // - `anchor` is the other end
        changeObj.update([
          { head: { line: 0, ch: 0 }, anchor: { line: 0, ch: 0 } },
        ])
      }
    }
  }

  private onChanges = (
    cm: CodeMirror.Editor,
    changes: CodeMirror.EditorChangeLinkedList[]
  ) => {
    if (this.props.onChanges) {
      this.props.onChanges(cm, changes)
    }
  }

  private onViewportChange = (
    cm: CodeMirror.Editor,
    from: number,
    to: number
  ) => {
    if (this.props.onViewportChange) {
      this.props.onViewportChange(cm, from, to)
    }
  }

  private onRenderLine = (
    cm: CodeMirror.Editor,
    line: CodeMirror.LineHandle,
    element: HTMLElement
  ) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, element)
    }
  }

  private onRef = (ref: HTMLDivElement | null) => {
    this.wrapper = ref
  }

  public render() {
    return <div className={this.props.className} ref={this.onRef} />
  }
}
