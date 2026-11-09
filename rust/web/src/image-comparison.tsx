import * as React from 'react'
import { Image } from './upstream/diff/image'
import { ImageDiffType } from './upstream/diff/image-diff'
import { ModifiedImageDiff } from './upstream/image-diffs/modified-image-diff'
import { NewImageDiff } from './upstream/image-diffs/new-image-diff'
import { DeletedImageDiff } from './upstream/image-diffs/deleted-image-diff'
import {
  ImageContainer,
  imageSource,
} from './upstream/image-diffs/image-container'

export interface IImageSide {
  readonly mode: string | null
  readonly size: number
  readonly image: { readonly mime: string; readonly data: string } | null
}
function materialize(side: IImageSide): Image | null {
  const encoded = side.image
  // Rust captures at most 1 MiB per side. Do not accept an unbounded payload
  // from a malformed response, or turn an arbitrary string into a URL.
  if (
    !encoded ||
    encoded.data.length > 1398104 ||
    !Number.isSafeInteger(side.size) ||
    side.size < 0
  )
    return null
  const image = new Image(
    new ArrayBuffer(0),
    encoded.data,
    encoded.mime,
    side.size
  )
  return imageSource(image) ? image : null
}
/** Reuse upstream image presentations for captured working/staged/history versions. */
export function ImageComparison({
  before,
  after,
}: {
  readonly before: IImageSide
  readonly after: IImageSide
}) {
  const previous = React.useMemo(() => materialize(before), [before]),
    current = React.useMemo(() => materialize(after), [after])
  const [mode, setMode] = React.useState(ImageDiffType.TwoUp)
  if (previous && current)
    return (
      <ModifiedImageDiff
        previous={previous}
        current={current}
        diffType={mode}
        onChangeDiffType={setMode}
      />
    )
  if (current && before.mode === null) return <NewImageDiff current={current} />
  if (previous && after.mode === null)
    return <DeletedImageDiff previous={previous} />
  return (
    <div className="image-diff">
      {[
        { label: 'Before', side: before, image: previous },
        { label: 'After', side: after, image: current },
      ].map(({ label, side, image }) => (
        <figure key={label}>
          <figcaption>
            {label} · {side.size} bytes
          </figcaption>
          {image ? (
            <ImageContainer image={image} label={`${label} image`} />
          ) : (
            <p>
              {side.mode === null
                ? 'Absent'
                : 'No image preview for this version.'}
            </p>
          )}
        </figure>
      ))}
    </div>
  )
}
