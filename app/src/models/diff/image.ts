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

  public constructor(contents: string, mediaType: string) {
    this.contents = contents
    this.mediaType = mediaType
  }
}
