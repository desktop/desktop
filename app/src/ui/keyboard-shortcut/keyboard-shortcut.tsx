import * as React from 'react'

interface IKeyboardShortCutProps {
  /** Windows/Linux keyboard shortcut */
  readonly keys: ReadonlyArray<string>
  /** MacOS keyboard shortcut */
  readonly darwinKeys: ReadonlyArray<string>
}

export class KeyboardShortcut extends React.Component<IKeyboardShortCutProps> {
  public render() {
    if (__DARWIN__) {
      return this.props.darwinKeys.map((k, i) => <kbd key={k + i}>{k}</kbd>)
    } else {
      return this.props.keys.map((k, i) => {
        return this.props.keys.length === i + 1 ? (
          <kbd key={k + i}>{k}</kbd>
        ) : (
          <>
            <kbd key={k + i}>{k}</kbd>
            <>+</>
          </>
        )
      })
    }
  }
}
