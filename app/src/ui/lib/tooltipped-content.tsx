import * as React from 'react'
import { ITooltipProps, Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'

interface ITooltippedContentProps
  extends Omit<ITooltipProps<HTMLElement>, 'target'> {
  readonly tooltip: JSX.Element | string
  readonly wrapperElement?: 'span' | 'div'
}

/** A button component that can be unchecked or checked by the user. */
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
          <Tooltip target={this.wrapperRef} {...rest}>
            {tooltip}
          </Tooltip>
          {children}
        </>
      ),
    })
  }
}
