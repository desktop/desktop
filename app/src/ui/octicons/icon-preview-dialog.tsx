import * as React from 'react'
import { Dialog, DialogContent } from '../dialog'
import * as octicons from './octicons.generated'
import { Octicon, OcticonSymbolVariant, OcticonSymbolVariants } from '.'

interface IIconPreviewDialogProps {
  readonly onDismissed: () => void
}

export class IconPreviewDialog extends React.Component<IIconPreviewDialogProps> {
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
      <li key={name}>
        <h2>{name}</h2>
        <ul>
          {Object.entries(icons).map(([size, icon]) =>
            this.renderIcon(name, size, icon)
          )}
        </ul>
      </li>
    )
  }

  private renderIcon(name: string, height: string, icon: OcticonSymbolVariant) {
    const sizeText = `${icon.h}x${icon.w}`
    const title = `${name} - ${sizeText}`

    return (
      <li key={`name-${sizeText}`}>
        <Octicon height={parseInt(height)} symbol={icon} title={title} />
        <small>{sizeText}</small>
      </li>
    )
  }
}
