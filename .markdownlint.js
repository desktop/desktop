const markdownlintGitHub = require('@github/markdownlint-github')

// Preserve the conventions used throughout the existing documentation.
module.exports = markdownlintGitHub.init({
  'blanks-around-headings': false,
  'blanks-around-lists': false,
  'commands-show-output': false,
  'fenced-code-language': false,
  'heading-increment': false,
  'line-length': false,
  'no-alt-text': false,
  'no-duplicate-heading': false,
  'no-generic-link-text': false,
  'no-multiple-blanks': false,
  'no-trailing-punctuation': false,
  'no-trailing-spaces': false,
  'ol-prefix': false,
  'single-h1': false,
  'ul-indent': false,
  'ul-style': true,
})
