import * as React from 'react'
import { Dialog, DialogContent } from '../dialog'
import * as octicons from './octicons.generated'
import { Octicon, OcticonSymbolVariant, OcticonSymbolVariants } from '.'

interface IIconPreviewDialogProps {
  readonly onDismissed: () => void
}

export class IconPreviewDialog extends React.Component<
  IIconPreviewDialogProps,
  {}
> {
  public render() {
    return (
      <Dialog
        id="octicons-preview-dialog"
        className="octicons-preview-dialog"
        title="Icon Preview"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <ul className="octicons-preview-list">
            {Object.entries(octicons).map(([name, variants]) =>
              this.renderIconVariants(name, variants)
            )}
          </ul>
        </DialogContent>
      </Dialog>
    )
  }

  private renderIconVariants(name: string, icons: OcticonSymbolVariants) {
    return (
      <li key={name} className="octicons-preview-item">
        <h3>{name}</h3>
        {Object.entries(icons).map(([size, icon]) =>
          this.renderIcon(name, size, icon)
        )}
      </li>
    )
  }

  private renderIcon(name: string, size: string, icon: OcticonSymbolVariant) {
    const title = `${name} - ${icon.h}x${icon.w}`

    return (
      <Octicon
        key={`name-${size}`}
        height={parseInt(size)}
        symbol={icon}
        title={title}
      />
    )
  }
}
