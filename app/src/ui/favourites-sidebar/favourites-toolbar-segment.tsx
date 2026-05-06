import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import { FavouriteGroup } from '../../models/favourite-group'

interface IFavouritesToolbarSegmentProps {
  readonly dispatcher: Dispatcher
  readonly activeGroup: FavouriteGroup | null
  readonly activeGroupCount: number
}

export class FavouritesToolbarSegment extends React.Component<
  IFavouritesToolbarSegmentProps,
  {}
> {
  public render() {
    const { activeGroup, activeGroupCount } = this.props
    const title =
      activeGroup === null
        ? 'No groups'
        : `${activeGroup.name} (${activeGroupCount})`

    return (
      <div className="favourites-toolbar-segment">
        <Octicon className="icon" symbol={octicons.star} />
        <div className="text">
          <div className="description">Favourites</div>
          <div className="title">{title}</div>
        </div>
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
