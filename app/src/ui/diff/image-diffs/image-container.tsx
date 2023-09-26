import * as React from 'react'

import { Image } from '../../../models/diff'

import parseDDS from 'parse-dds'

interface IImageProps {
  /** The image contents to render */
  readonly image: Image

  /** Optional styles to apply to the image container */
  readonly style?: React.CSSProperties

  /** callback to fire after the image has been loaded */
  readonly onElementLoad?: (img: HTMLImageElement) => void
}

interface IImageState {
  readonly imageLoaded: boolean

  readonly imageSource: String | null
}

export class ImageContainer extends React.Component<IImageProps, IImageState> {
  public constructor(props: IImageProps) {
    super(props)
    this.state = {
      imageLoaded: false,
      imageSource: null,
    }
  }

  public componentDidMount() {
    const { image } = this.props
    // Check the image type and load accordingly
    if (image.mediaType === 'image/vnd-ms.dds') {
      try {
        const binaryString = Buffer.from(image.contents, 'base64').toString(
          'binary'
        )
        const uint8Array = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i)
        }

        const ddsBuffer = uint8Array.buffer

        const ddsData = parseDDS(ddsBuffer)
        // Get the first mipmap texture.
        const [dataImage] = ddsData.images
        const [imageWidth, imageHeight] = dataImage.shape
        const imageData = new Uint8Array(
          ddsBuffer,
          dataImage.offset,
          dataImage.length
        )

        // Draw the DXT texture to the canvas using WebGL2.
        const canvas = document.createElement('canvas')
        this.drawToCanvas(
          canvas,
          ddsData.format,
          imageWidth,
          imageHeight,
          imageData
        )

        // Convert canvas to data URL and set it as the image source.
        const dataURL = canvas.toDataURL('image/png', 1)

        console.log(dataURL)

        this.setState({
          imageLoaded: true,
          imageSource: dataURL,
        })
      } catch (error) {
        console.error('Error loading DDS image:', error)
        this.setState({ imageLoaded: true, imageSource: null })
      }
    } else {
      // Load other image types
      this.setState({
        imageLoaded: true,
        imageSource: `data:${image.mediaType};base64,${image.contents}`,
      })
    }
  }

  private drawToCanvas(
    canvas: HTMLCanvasElement,
    format: string,
    width: number,
    height: number,
    imageData: Uint8Array
  ) {
    canvas.width = width
    canvas.height = height
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
    if (gl != null) {
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      const ext = gl.getExtension('WEBGL_compressed_texture_s3tc')
      if (ext != null) {
        const internalFormat = this.getFormat(ext, format)
        gl.compressedTexImage2D(
          gl.TEXTURE_2D,
          0,
          internalFormat,
          width,
          height,
          0,
          imageData
        )
      } else {
        throw new Error('Unable to get GL extension')
      }
    } else {
      throw new Error(
        'Unable to initialize WebGL. Your browser or machine may not support it.'
      )
    }
  }

  private getFormat(
    ext: {
      COMPRESSED_RGB_S3TC_DXT1_EXT: any
      COMPRESSED_RGBA_S3TC_DXT3_EXT: any
      COMPRESSED_RGBA_S3TC_DXT5_EXT: any
    },
    ddsFormat: string
  ) {
    switch (ddsFormat) {
      case 'dxt1':
        return ext.COMPRESSED_RGB_S3TC_DXT1_EXT
      case 'dxt3':
        return ext.COMPRESSED_RGBA_S3TC_DXT3_EXT
      case 'dxt5':
        return ext.COMPRESSED_RGBA_S3TC_DXT5_EXT
      default:
        throw new Error('Unsupported format ' + ddsFormat)
    }
  }

  public render() {
    const { style } = this.props
    const { imageLoaded, imageSource } = this.state

    return (
      <div className="image-wrapper">
        {imageLoaded ? (
          <img
            src={imageSource as string} // Cast to string
            style={style}
            alt=""
            onLoad={this.onLoad}
          />
        ) : (
          <p>Loading image...</p>
        )}
      </div>
    )
  }

  private onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.props.onElementLoad) {
      this.props.onElementLoad(e.currentTarget)
    }
  }
}
