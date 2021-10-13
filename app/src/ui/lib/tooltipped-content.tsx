import * as React from 'react'
import { ITooltipProps, Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'

interface ITooltippedContentProps
  extends Omit<ITooltipProps<HTMLElement>, 'target'> {
  readonly tooltip: JSX.Element | string | undefined
  readonly tagName?: keyof HTMLElementTagNameMap
  readonly tooltipClassName?: string
  readonly className?: string
}

/**
 * A less complicated version of the Tooltip component for when it's acceptable
 * to add a wrapping element around the content. supports all the options that
 * the Tooltip component does without having to worry about refs.
 **/
export class TooltippedContent extends React.Component<
  ITooltippedContentProps
> {
  private wrapperRef = createObservableRef<HTMLElement>()

  public render() {
    const {
      tooltip,
      tagName,
      children,
      className,
      tooltipClassName,
      ...rest
    } = this.props

    return React.createElement(tagName ?? 'span', {
      ref: this.wrapperRef,
      className: className,
      children: (
        <>
          {tooltip !== undefined && (
            <Tooltip
              target={this.wrapperRef}
              className={tooltipClassName}
              {...rest}
            >
              {tooltip}
            </Tooltip>
          )}
          {children}
        </>
      ),
    })
  }
}
