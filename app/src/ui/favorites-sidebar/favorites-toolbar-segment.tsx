import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import { FavoriteGroup } from '../../models/favorite-group'

interface IFavoritesToolbarSegmentProps {
  readonly dispatcher: Dispatcher
  /** The currently active favorites group, or null when none exist. */
  readonly activeGroup: FavoriteGroup | null
  /** Number of repositories in the active group. */
  readonly activeGroupCount: number
}

/**
 * Header for the favorites column rendered inside the toolbar row. Mirrors
 * the icon + two-row layout of the Current Repository / Current Branch
 * toolbar buttons so all four toolbar items read consistently.
 */
export class FavoritesToolbarSegment extends React.Component<
  IFavoritesToolbarSegmentProps,
  {}
> {
  public render() {
    const { activeGroup, activeGroupCount } = this.props
    const title =
      activeGroup === null
        ? 'No groups'
        : `${activeGroup.name} (${activeGroupCount})`

    return (
      <div className="favorites-toolbar-segment">
        <Octicon className="icon" symbol={octicons.star} />
        <div className="text">
          <div className="description">Favorites</div>
          <div className="title">{title}</div>
        </div>
        <button
          type="button"
          className="favorites-toolbar-segment-add"
          onClick={this.onAddGroup}
          aria-label="New favorites group"
        >
          <Octicon symbol={octicons.plus} />
        </button>
      </div>
    )
  }

  private onAddGroup = () => {
    this.props.dispatcher.showPopup({ type: PopupType.NewFavoriteGroup })
  }
}
