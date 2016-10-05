import * as React from 'react'

import { ImageDiff } from '../../models/diff'

export function renderImage(image: ImageDiff | undefined) {

  if (!image) { return null }

  const imageSource = `data:${image.mediaType};base64,${image.contents}`

  return (<img src={imageSource} />)
}
