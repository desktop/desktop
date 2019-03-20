import * as React from 'react'
import * as CodeMirror from 'codemirror'

// Required for us to be able to customize the foreground color of selected text
import 'codemirror/addon/selection/mark-selection'

// Autocompletion plugin
import 'codemirror/addon/hint/show-hint'
import {
  Doc,
  EditorChangeLinkedList,
  Editor,
  EditorConfiguration,
  LineHandle,
} from 'codemirror'

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
  readonly value: string | Doc

  /** Any CodeMirror specific settings */
  readonly options?: EditorConfiguration

  /** Callback for diff to control whether selection is enabled */
  readonly isSelectionEnabled?: () => boolean

  /** Callback for when CodeMirror renders (or re-renders) a line */
  readonly onRenderLine?: (
    cm: Editor,
    line: LineHandle,
    elem: HTMLElement
  ) => void

  /** Callback for when CodeMirror has completed a batch of changes to the editor */
  readonly onChanges?: (cm: Editor, change: EditorChangeLinkedList[]) => void

  /** Callback for when the viewport changes due to scrolling or other updates */
  readonly onViewportChange?: (cm: Editor, from: number, to: number) => void

  /** Callback for when the editor document is swapped out for a new one */
  readonly onSwapDoc?: (cm: Editor, oldDoc: Doc) => void

  /**
   * Called after the document has been swapped, meaning that consumers of this
   * event have access to the updated viewport (as opposed to onSwapDoc)
   */
  readonly onAfterSwapDoc?: (cm: Editor, oldDoc: Doc, newDoc: Doc) => void

  /**
   * Called when content has been copied. The default behavior may be prevented
   * by calling `preventDefault` on the event.
   */
  readonly onCopy?: (editor: Editor, event: Event) => void
}

/**
 * A component hosting a CodeMirror instance
 */
export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, {}> {
  private wrapper: HTMLDivElement | null = null
  private codeMirror: Editor | null = null

  /**
   * Resize observer used for tracking width changes and
   * refreshing the internal codemirror instance when
   * they occur
   */
  private readonly resizeObserver: ResizeObserver
  private resizeDebounceId: number | null = null
  private lastKnownWidth: number | null = null

  private static updateDoc(cm: Editor, value: string | Doc) {
    if (typeof value === 'string') {
      cm.setValue(value)
    } else {
      cm.swapDoc(value)
    }
  }

  public constructor(props: ICodeMirrorHostProps) {
    super(props)

    // Observe size changes and let codemirror know
    // when it needs to refresh.
    this.resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 1 && this.codeMirror) {
        const newWidth = entries[0].contentRect.width

        // We don't care about the first resize, let's just
        // store what we've got. Codemirror already does a good
        // job of height changes through monitoring window resize,
        // we just need to care about when the width changes and
        // do a re-layout
        if (this.lastKnownWidth === null) {
          this.lastKnownWidth = newWidth
        } else if (this.lastKnownWidth !== newWidth) {
          this.lastKnownWidth = newWidth

          if (this.resizeDebounceId !== null) {
            cancelAnimationFrame(this.resizeDebounceId)
            this.resizeDebounceId = null
          }
          requestAnimationFrame(this.onResized)
        }
      }
    })
  }

  /**
   * Gets the internal CodeMirror instance or null if CodeMirror hasn't
   * been initialized yet (happens when component mounts)
   */
  public getEditor(): Editor | null {
    return this.codeMirror
  }

  public componentDidMount() {
    this.codeMirror = CodeMirror(this.wrapper!, this.props.options)

    this.codeMirror.on('renderLine', this.onRenderLine)
    this.codeMirror.on('changes', this.onChanges)
    this.codeMirror.on('viewportChange', this.onViewportChange)
    this.codeMirror.on('beforeSelectionChange', this.beforeSelectionChanged)
    this.codeMirror.on('copy', this.onCopy)
    this.codeMirror.on('swapDoc', this.onSwapDoc as any)

    CodeMirrorHost.updateDoc(this.codeMirror, this.props.value)
    this.resizeObserver.observe(this.codeMirror.getWrapperElement())
  }

  private onSwapDoc = (cm: Editor, oldDoc: Doc) => {
    if (this.props.onSwapDoc) {
      this.props.onSwapDoc(cm, oldDoc)
    }
  }

  private onCopy = (instance: Editor, event: Event) => {
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
      cm.off('copy', this.onCopy)
      cm.off('swapDoc', this.onSwapDoc as any)

      this.codeMirror = null
    }

    this.resizeObserver.disconnect()
  }

  public componentDidUpdate(prevProps: ICodeMirrorHostProps) {
    if (this.codeMirror && this.props.value !== prevProps.value) {
      const oldDoc = this.codeMirror.getDoc()
      CodeMirrorHost.updateDoc(this.codeMirror, this.props.value)
      const newDoc = this.codeMirror.getDoc()

      if (this.props.onAfterSwapDoc) {
        this.props.onAfterSwapDoc(this.codeMirror, oldDoc, newDoc)
      }
    }
  }

  private beforeSelectionChanged = (cm: Editor, changeObj: any) => {
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

  private onChanges = (cm: Editor, changes: EditorChangeLinkedList[]) => {
    if (this.props.onChanges) {
      this.props.onChanges(cm, changes)
    }
  }

  private onViewportChange = (cm: Editor, from: number, to: number) => {
    if (this.props.onViewportChange) {
      this.props.onViewportChange(cm, from, to)
    }
  }

  private onRenderLine = (cm: Editor, line: LineHandle, elem: HTMLElement) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, elem)
    }
  }

  private onResized = () => {
    this.resizeDebounceId = null
    if (this.codeMirror) {
      this.codeMirror.refresh()
    }
  }

  private onRef = (ref: HTMLDivElement | null) => {
    this.wrapper = ref
  }

  public render() {
    return <div className={this.props.className} ref={this.onRef} />
  }
}
