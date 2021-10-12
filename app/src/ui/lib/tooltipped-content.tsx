import * as React from 'react'
import { ITooltipProps, Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'

interface ITooltippedContentProps
  extends Omit<ITooltipProps<HTMLElement>, 'target'> {
  readonly tooltip: JSX.Element | string | undefined
  readonly wrapperElement?: 'span' | 'div'
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
    const { tooltip, wrapperElement, children, ...rest } = this.props

    return React.createElement(wrapperElement ?? 'span', {
      ref: this.wrapperRef,
      children: (
        <>
          {tooltip !== undefined && (
            <Tooltip target={this.wrapperRef} {...rest}>
              {tooltip}
            </Tooltip>
          )}
          {children}
        </>
      ),
    })
  }
}
