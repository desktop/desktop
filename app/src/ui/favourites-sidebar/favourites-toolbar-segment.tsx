import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'

interface IFavouritesToolbarSegmentProps {
  readonly dispatcher: Dispatcher
}

/**
 * Header for the favourites column rendered inside the toolbar row so the
 * column gets its own toolbar-level title and the existing repo dropdown
 * keeps its alignment with the changes sidebar below.
 */
export class FavouritesToolbarSegment extends React.Component<
  IFavouritesToolbarSegmentProps,
  {}
> {
  public render() {
    return (
      <div className="favourites-toolbar-segment">
        <span className="favourites-toolbar-segment-label">Favourites</span>
        <button
          type="button"
          className="favourites-toolbar-segment-add"
          onClick={this.onAddGroup}
          aria-label="New favourites group"
          title="New group"
        >
          <Octicon symbol={octicons.plus} />
        </button>
      </div>
    )
  }

  private onAddGroup = () => {
    this.props.dispatcher.showPopup({ type: PopupType.NewFavouriteGroup })
  }
}
