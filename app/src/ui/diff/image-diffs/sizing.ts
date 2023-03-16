export interface ISize {
  readonly width: number
  readonly height: number
}

/**
 * Get the size which fits in the container without scaling and maintaining
 * aspect ratio.
 */
export function getAspectFitSize(
  imageSize: ISize,
  containerSize: ISize
): ISize {
  const heightRatio =
    containerSize.height < imageSize.height
      ? imageSize.height / containerSize.height
      : 1
  const widthRatio =
    containerSize.width < imageSize.width
      ? imageSize.width / containerSize.width
      : 1

  let ratio = Math.max(1, widthRatio)
  if (widthRatio < heightRatio) {
    ratio = Math.max(1, heightRatio)
  }

  return {
    width: imageSize.width / ratio,
    height: imageSize.height / ratio,
  }
}

/**
 * Get the size which will fit the bigger of the two images while maintaining
 * aspect ratio.
 */
export function getMaxFitSize(
  previousImageSize: ISize,
  currentImageSize: ISize,
  containerSize: ISize
): ISize {
  const previousSize = getAspectFitSize(previousImageSize, containerSize)
  const currentSize = getAspectFitSize(currentImageSize, containerSize)

  const width = Math.max(previousSize.width, currentSize.width)
  const height = Math.max(previousSize.height, currentSize.height)
  return { width, height }
}
