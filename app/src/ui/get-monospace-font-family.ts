export const getMonospaceFontFamily = (): string => {
  // TODO: This is the same as the --font-family-monospace defined in
  // variables.scss but we could be more clever here and only pick
  // platform-specific fonts. Not sure if it matters.
  return "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace, 'Apple Color Emoji', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol'"
}
