import * as React from 'react'

import ReactCSSTransitionReplace from 'react-css-transition-replace'

interface ISuggestedActionGroup {
  /**
   * `primary` groups are visually distinct from `normal`
   * ones for emphasis. Defaults to `normal`.
   */
  type?: 'normal' | 'primary'

  /**
   * What animation, if any, should be applied to the group.
   * `replace` animation should only be used with a single
   * component at once.
   */
  transitions?: 'replace'

  /**
   * Pass `false` to skip enter/exit transitions, which
   * can be useful during initial component loading. Only used
   * if `transitions` is also included.
   *
   * Defaults to `true` (enabled transitions)
   */
  enableTransitions?: boolean
}

/**
 * Wraps a list of suggested action components with extra styling
 * and animations.
 */
export const SuggestedActionGroup: React.FunctionComponent<ISuggestedActionGroup> = props => {
  const cn = 'suggested-action-group ' + (props.type ? props.type : 'normal')
  if (props.transitions === 'replace') {
    const enableTransitions =
      props.enableTransitions !== undefined ? props.enableTransitions : true
    return (
      <ReactCSSTransitionReplace
        transitionAppear={false}
        overflowHidden={false}
        transitionEnter={enableTransitions}
        transitionLeave={enableTransitions}
        transitionName={props.transitions}
        component="div"
        className={cn}
        transitionEnterTimeout={750}
        transitionLeaveTimeout={500}
      >
        {props.children}
      </ReactCSSTransitionReplace>
    )
  }
  return <div className={cn}>{props.children}</div>
}
