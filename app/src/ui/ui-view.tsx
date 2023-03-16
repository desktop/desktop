import * as React from 'react'
import classNames from 'classnames'

/**
 * High order component for housing a View.
 *
 * In Desktop we currently define a view as a component which occupies
 * the entire app save for the sidebar and minus any currently active
 * popovers and of which there's only ever one single instance active
 * at any point in time.
 *
 * Examples of views are <Repository /> and <CloningRepository />.
 *
 * Examples of what's not a View include the Changes and History tabs
 * as these are contained within the <Repository /> view
 */
export class UiView extends React.Component<React.HTMLProps<HTMLDivElement>> {
  public render() {
    const className = classNames(this.props.className, 'ui-view')
    const props = { ...this.props, className }

    return <div {...props}>{this.props.children}</div>
  }
}
