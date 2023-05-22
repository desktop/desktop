import * as React from 'react'

interface IKeyboardShortCutProps {
  /** Windows/Linux keyboard shortcut */
  readonly keys: ReadonlyArray<string>
  /** MacOS keyboard shortcut */
  readonly darwinKeys: ReadonlyArray<string>
}

export class KeyboardShortcut extends React.Component<IKeyboardShortCutProps> {
  public render() {
    const keys = __DARWIN__ ? this.props.darwinKeys : this.props.keys

    return keys.map((k, i) => {
      return (
        <React.Fragment key={k + i}>
          <kbd>{k}</kbd>
          {!__DARWIN__ && i < keys.length - 1 ? <>+</> : null}
        </React.Fragment>
      )
    })
  }
}
