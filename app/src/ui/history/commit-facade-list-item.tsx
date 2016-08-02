import * as React from 'react'

/** A fake commit list item, to be shown before the commit is loaded. */
export default class CommitFacadeListItem extends React.Component<void, void> {
  public render() {
    return (
      <div className='commit facade'>
        <img className='avatar'/>
        <div className='info'>
          <div className='summary'/>
          <div className='byline' title='Loading…'/>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: void, nextState: void): boolean {
    return false
  }
}
