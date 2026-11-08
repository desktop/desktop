import * as React from 'react'
import { Image } from '../diff/image'
import { convertDDSImage } from './dds-converter'

interface IImageProps {
  readonly image: Image
  readonly style?: React.CSSProperties
  readonly onElementLoad?: (img: HTMLImageElement) => void
  readonly label?: string
}
interface IImageState {
  readonly imageSource: string | null
  readonly failed: boolean
}
const mediaTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/avif',
])
/** Only repository image bytes can become an image source; URLs and markup cannot. */
export function imageSource(image: Image): string | null {
  if (
    !mediaTypes.has(image.mediaType) ||
    !image.contents ||
    image.contents.length % 4 !== 0 ||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(image.contents)
  )
    return null
  return `data:${image.mediaType};base64,${image.contents}`
}
/** Render native browser images or the upstream DDS conversion with visible errors. */
export class ImageContainer extends React.Component<IImageProps, IImageState> {
  public constructor(props: IImageProps) {
    super(props)
    this.state = { imageSource: null, failed: false }
  }
  public loadImage(image: Image) {
    try {
      const source =
        image.mediaType === 'image/vnd-ms.dds'
          ? convertDDSImage(image.rawContents)
          : imageSource(image)
      this.setState({ imageSource: source, failed: source === null })
    } catch {
      this.setState({ imageSource: null, failed: true })
    }
  }
  public componentDidMount() {
    this.loadImage(this.props.image)
  }
  public componentDidUpdate(previous: IImageProps) {
    if (previous.image !== this.props.image) this.loadImage(this.props.image)
  }
  public render() {
    const source = this.state.imageSource
    if (this.state.failed)
      return (
        <p role="alert">
          Image could not be decoded. Its original file contents are unchanged.
        </p>
      )
    if (!source) return null
    return (
      <div className="image-wrapper">
        <img
          key={source}
          src={source}
          style={this.props.style}
          alt={this.props.label || ''}
          onLoad={event => {
            if (this.state.imageSource !== source) return
            if (
              event.currentTarget.naturalWidth === 0 ||
              event.currentTarget.naturalHeight === 0
            ) {
              this.setState({ failed: true })
              return
            }
            this.props.onElementLoad?.(event.currentTarget)
          }}
          onError={() => {
            if (this.state.imageSource === source)
              this.setState({ failed: true })
          }}
        />
      </div>
    )
  }
}
