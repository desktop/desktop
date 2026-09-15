import assert from 'node:assert'
import { describe, it } from 'node:test'

import { isApplicationBundleFromMetadata } from '../../src/lib/is-application-bundle'

describe('isApplicationBundleFromMetadata', () => {
  it('identifies application bundles', async () => {
    const metadata = `
      kMDItemContentType = "com.apple.application-bundle"
      kMDItemContentTypeTree = (
        "com.apple.application-bundle",
        "public.executable",
        "public.directory"
      )
    `

    assert.strictEqual(isApplicationBundleFromMetadata(metadata), true)
  })

  it('identifies non-executable directories', async () => {
    const metadata = `
      kMDItemContentType = "public.folder"
      kMDItemContentTypeTree = (
        "public.folder",
        "public.directory",
        "public.item"
      )
    `

    assert.strictEqual(isApplicationBundleFromMetadata(metadata), false)
  })

  it('rejects inconclusive metadata', async () => {
    assert.throws(
      () => isApplicationBundleFromMetadata('kMDItemContentType = (null)'),
      /did not conclusively identify a directory/
    )
  })

  it('rejects an unknown primary type that inherits from public.directory', async () => {
    const metadata = `
      kMDItemContentType = "com.example.package"
      kMDItemContentTypeTree = (
        "com.example.package",
        "public.directory",
        "public.item"
      )
    `

    assert.throws(
      () => isApplicationBundleFromMetadata(metadata),
      /did not conclusively identify a directory/
    )
  })
})
