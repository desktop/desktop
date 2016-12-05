import * as React from 'react'

interface IAccessTextProps {
  readonly text: string,
  readonly highlight?: boolean,
}

/**
 * A platform helper function which optionally highlights access keys (letters
 * prefixed with &) on Windows. On non-Windows platform access key prefixes
 * are removed before rendering.
 */
export class AccessText extends React.Component<IAccessTextProps, void> {
  public shouldComponentUpdate(nextProps: IAccessTextProps) {
    return this.props.text !== nextProps.text ||
      this.props.highlight !== nextProps.highlight
  }

  public render() {
    if (this.props.highlight) {
      const m = this.props.text.match(/^(.*?)?(?:&([^8]))(.*)?$/)
      const elements = []

      if (m) {

        if (m[1]) {
          elements.push(<span key={1}>{m[1]}</span>)
        }

        elements.push(<span key={2} className='access-key highlight'>{m[2]}</span>)

        if (m[3]) {
          elements.push(<span key={3}>{m[3]}</span>)
        }

        return <span>{elements}</span>
      }
    }

    const text = this.props.text
      .replace(/&[^&]/, '')
      .replace('&&', '')

    return <span>{text}></span>
  }
}
