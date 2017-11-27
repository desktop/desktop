import * as React from 'react'
import { ModifiedImageDiff } from './modified-image-diff'
import { NewImageDiff } from './new-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'

import { ImageDiffType } from '../../../lib/app-state'
import { Image, DiffHunk } from '../../../models/diff'
import { TextDiff, ITextDiffUtilsProps } from '../text-diff'
import { TabBar, TabBarType } from '../../tab-bar'

/** The props for the Diff component. */
interface IDiffProps extends ITextDiffUtilsProps {
  /** The diff that should be rendered */
  readonly previous?: Image
  readonly current?: Image
  readonly text?: string
  readonly hunks?: ReadonlyArray<DiffHunk>

  /** called when changing the type of image diff to display */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType
}

/** A component which renders a diff for a file. */
export class ImageDiff extends React.Component<IDiffProps, {}> {
  private isModified = () => {
    return !!this.props.current && !!this.props.previous
  }
  private onChangeDiffType = (index: number) => {
    if (this.isModified()) {
      this.props.onChangeImageDiffType(index)
      return
    }
    this.props.onChangeImageDiffType(
      index === 1 ? ImageDiffType.Text : ImageDiffType.TwoUp
    )
  }

  private renderContent() {
    if (
      this.props.imageDiffType === ImageDiffType.Text &&
      this.props.text &&
      this.props.hunks
    ) {
      return (
        <TextDiff
          repository={this.props.repository}
          readOnly={this.props.readOnly}
          file={this.props.file}
          text={this.props.text}
          hunks={this.props.hunks}
          onIncludeChanged={this.props.onIncludeChanged}
        />
      )
    }
    if (this.props.current && this.props.previous) {
      return (
        <ModifiedImageDiff
          diffType={this.props.imageDiffType}
          current={this.props.current}
          previous={this.props.previous}
        />
      )
    }

    if (this.props.current) {
      return <NewImageDiff current={this.props.current} />
    }

    if (this.props.previous) {
      return <DeletedImageDiff previous={this.props.previous} />
    }

    return null
  }

  private renderTabs(isModified: boolean): JSX.Element[] {
    const tabs = isModified
      ? [
          <span key="2-up">2-up</span>,
          <span key="swipe">Swipe</span>,
          <span key="onion">Onion Skin</span>,
          <span key="diff">Difference</span>,
        ]
      : [<span key="visual">Visual</span>]

    if (this.props.text) {
      tabs.push(<span key="text">Text</span>)
    }
    return tabs
  }

  public render() {
    const isModified = this.isModified()
    const shouldRenderTabBar = this.props.text || isModified
    return (
      <div className="panel image" id="diff">
        {this.renderContent()}

        {shouldRenderTabBar ? (
          <TabBar
            selectedIndex={
              isModified
                ? this.props.imageDiffType
                : this.props.imageDiffType === ImageDiffType.Text ? 1 : 0
            }
            onTabClicked={this.onChangeDiffType}
            type={TabBarType.Switch}
          >
            {this.renderTabs(isModified)}
          </TabBar>
        ) : null}
      </div>
    )
  }
}
