/**
 * A container for holding an image for display in the application
 */
export class Image {
  /**
   * @param contents The base64 encoded contents of the image.
   * @param mediaType The data URI media type, so the browser can render the image correctly.
   * @param bytes Size of the file in bytes.
   */
  public constructor(
    public readonly rawContents: ArrayBufferLike,
    public readonly contents: string,
    public readonly mediaType: string,
    public readonly bytes: number
  ) {}
}
