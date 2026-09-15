import * as React from 'react'

/**
 * A simple style component used to mark up arbitrary references such as
 * branches, commit SHAs, paths or other content which needs to be presented
 * in an emphasized way and that benefit from fixed-width fonts.
 *
 * While the styling of the component _may_ differs depending on what context
 * it appears in the general style is an inline-box with a suitable background
 * color, using a fixed-width font.
 */
export class Ref extends React.Component<{}, {}> {
  public render() {
    return <em className="ref-component">{this.props.children}</em>
  }
}
