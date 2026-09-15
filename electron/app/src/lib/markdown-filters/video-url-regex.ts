import escapeRegExp from 'lodash/escapeRegExp'

const user_images_cdn_url = 'https://user-images.githubusercontent.com'

// List of common video formats obtained from
// https://developer.mozilla.org/en-US/docs/https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Video_codecs/Media/Formats/Video_codecs
// The MP4, WebM, and Ogg formats are supported by HTML standard.
const videoExtensionRegex = /(mp4|webm|ogg|mov|qt|avi|wmv|3gp|mpg|mpeg|)$/

/** Regex for checking if a url is a github asset cdn video url */
export const githubAssetVideoRegex = new RegExp(
  '^' + escapeRegExp(user_images_cdn_url) + '.+' + videoExtensionRegex.source,
  'i'
)
