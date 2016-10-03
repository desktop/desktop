import * as React from 'react'

const uiViewClassName = 'ui-view'

interface IUiViewProps extends React.HTMLProps<HTMLDivElement> { }

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
export class UiView extends React.Component<IUiViewProps, void> {

  public static defaultProps: IUiViewProps = {
    className: uiViewClassName,
  }

  public render() {

    // TODO: If this gets more complex, consider using something like
    // https://github.com/JedWatson/classnames
    if (this.props.className !== 'ui-view') {
      this.props.className += ` ${uiViewClassName}`
    }

    return <div {...this.props}>
      {this.props.children}
    </div>
  }
}
