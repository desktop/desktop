/**
 * A container for holding an image for display in the application
 */
export class Image {
  /**
   * The base64 encoded contents of the image
   */
  public readonly contents: string

  /**
   * The data URI media type, so the browser can render the image correctly
   */
  public readonly mediaType: string

  /**
   * Size of the file in bytes
   */
  public readonly bytes: number

  public constructor(contents: string, mediaType: string, bytes: number) {
    this.contents = contents
    this.mediaType = mediaType
    this.bytes = bytes
  }
}
