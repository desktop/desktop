import * as React from 'react'
import classNames from 'classnames'

import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { CheckboxValue } from '../lib/checkbox'
import { mapStatus } from '../../lib/status'
import { WorkingDirectoryFileChange } from '../../models/status'
import { TooltipDirection } from '../lib/tooltip'
import { TooltippedContent } from '../lib/tooltipped-content'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { IMatches } from '../../lib/fuzzy-find'

interface IChangedFileProps {
  readonly file: WorkingDirectoryFileChange
  readonly include: boolean | null
  readonly availableWidth: number
  readonly disableSelection: boolean
  readonly checkboxTooltip?: string
  readonly focused: boolean
  /** The characters in the file path to highlight */
  readonly matches?: IMatches
  readonly onIncludeChanged: (
    file: WorkingDirectoryFileChange,
    include: boolean
  ) => void
}

/** a changed file in the working directory for a given repository */
export class ChangedFile extends React.Component<IChangedFileProps, {}> {
  private handleCheckboxClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    if (this.props.disableSelection) {
      return
    }
    const nextInclude = this.props.include !== true
    this.props.onIncludeChanged(this.props.file, nextInclude)
  }

  private handleCheckboxDoubleClick = (
    event: React.MouseEvent<HTMLSpanElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
  }

  private get checkboxValue(): CheckboxValue {
    if (this.props.include === true) {
      return CheckboxValue.On
    } else if (this.props.include === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  public render() {
    const {
      file,
      availableWidth,
      disableSelection,
      checkboxTooltip,
      focused,
      matches,
    } = this.props
    const { status, path } = file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const checkboxWidth = 20
    const statusWidth = 16
    const filePadding = 5

    const availablePathWidth =
      availableWidth -
      listItemPadding -
      checkboxWidth -
      filePadding -
      statusWidth

    const includedText =
      this.props.include === true
        ? 'included'
        : this.props.include === undefined
        ? 'partially included'
        : 'not included'

    const pathScreenReaderMessage = `${path} ${mapStatus(
      status
    )} ${includedText}`

    return (
      <div className="file">
        <TooltippedContent
          tooltip={checkboxTooltip}
          direction={TooltipDirection.EAST}
          tagName="div"
        >
          {/* Decorative non-focusable checkbox: ListRow (role="option") handles
              keyboard Space toggling and screen-reader announcements so we avoid
              nesting a focusable <input> inside role="option" (nested-interactive). */}
          <span
            aria-hidden="true"
            className={classNames('changed-file-checkbox', {
              checked: this.checkboxValue === CheckboxValue.On,
              mixed: this.checkboxValue === CheckboxValue.Mixed,
              disabled: disableSelection,
            })}
            onClick={this.handleCheckboxClick}
            onDoubleClick={this.handleCheckboxDoubleClick}
          >
            {this.checkboxValue === CheckboxValue.On && (
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                width="10"
                height="10"
                focusable="false"
              >
                <path
                  d="M2.2 6.2 4.8 8.8 9.8 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {this.checkboxValue === CheckboxValue.Mixed && (
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                width="10"
                height="10"
                focusable="false"
              >
                <path
                  d="M2.5 6h7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
        </TooltippedContent>

        <PathLabel
          path={path}
          status={status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
          matches={matches}
        />

        <AriaLiveContainer message={pathScreenReaderMessage} />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.EAST}
        >
          <Octicon
            symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
      </div>
    )
  }
}
