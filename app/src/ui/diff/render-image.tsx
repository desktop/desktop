import * as React from 'react'

import { Image } from '../../models/diff'

export function renderImage(image: Image | undefined) {

  if (!image) { return null }

  const imageSource = `data:${image.mediaType};base64,${image.contents}`

  return (<img src={imageSource} />)
}
