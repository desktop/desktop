import * as React from 'react'
import classNames from 'classnames'

interface IAccessTextProps {
  /**
   * A string which optionally contains an access key modifier (ampersand).
   * The access key modifier directly precedes the character which is
   * highlighted when the highlight property is set. Literal ampersand
   * characters need to be escaped by using two ampersand characters (&&).
   *
   * At most one character is allowed to have a preceding ampersand character.
   */
  readonly text: string

  /**
   * Whether or not to highlight the access key (if one exists).
   */
  readonly highlight?: boolean
}

function unescape(accessText: string) {
  return accessText.replace('&&', '&')
}

/**
 * A platform helper function which optionally highlights access keys (letters
 * prefixed with &) on Windows. On non-Windows platform access key prefixes
 * are removed before rendering.
 */
export class AccessText extends React.Component<IAccessTextProps, {}> {
  public shouldComponentUpdate(nextProps: IAccessTextProps) {
    return (
      this.props.text !== nextProps.text ||
      this.props.highlight !== nextProps.highlight
    )
  }

  public render() {
    // Match everything (if anything) before an ampersand followed by anything that's
    // not an ampersand and then capture the remainder.
    const m = this.props.text.match(/^(.*?)?(?:&([^&]))(.*)?$/)

    if (!m) {
      return <span>{this.props.text}</span>
    }

    const elements = new Array<JSX.Element>()

    if (m[1]) {
      elements.push(
        <span key={1} aria-hidden={true}>
          {unescape(m[1])}
        </span>
      )
    }

    const className = classNames('access-key', {
      highlight: this.props.highlight,
    })

    elements.push(
      <span aria-hidden={true} key={2} className={className}>
        {m[2]}
      </span>
    )

    if (m[3]) {
      elements.push(
        <span key={3} aria-hidden={true}>
          {unescape(m[3])}
        </span>
      )
    }

    const preText = m[1] ? unescape(m[1]) : ''
    const accessKeyText = m[2]
    const postText = m[3] ? unescape(m[3]) : ''

    const plainText = `${preText}${accessKeyText}${postText}`

    // When adding this linter disable, I thought about changing this to use a
    // screen reader only span instead of aria-label as I believe the purpose to
    // to provide a label for screen readers... But wasn't 100% sure if that is
    // it's purpose to be dug into later.
    // eslint-disable-next-line github/a11y-role-supports-aria-props
    return <span aria-label={plainText}>{elements}</span>
  }
}
