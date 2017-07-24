import * as React from 'react'

import { Image } from '../../models/diff'

export function renderImage(
  image: Image | undefined,
  props?: {
    style?: {}
    onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  }
) {
  if (!image) {
    return null
  }

  const imageSource = `data:${image.mediaType};base64,${image.contents}`

  return <img src={imageSource} {...props} />
}
