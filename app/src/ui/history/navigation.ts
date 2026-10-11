/** History shortcuts also work inside the read-only diff's hidden textarea. */
export function getHistoryNavigation(event: KeyboardEvent) {
  const direction =
    event.code === 'ArrowUp' || event.key === 'ArrowUp'
      ? -1
      : event.code === 'ArrowDown' || event.key === 'ArrowDown'
        ? 1
        : null

  if (
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    direction === null
  ) {
    return null
  }
  const target = event.target
  // Switching commits replaces the focused diff. Until the next interaction,
  // Chromium puts focus on body; keep consecutive navigation keys working.
  if (
    !(target instanceof HTMLElement) ||
    (target !== document.body && !target.closest('#repository'))
  ) {
    return null
  }
  if (
    !target.closest('#history .CodeMirror') &&
    (target.isContentEditable ||
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]'
      ))
  ) {
    return null
  }
  return {
    kind: event.shiftKey ? ('commit' as const) : ('file' as const),
    direction,
  }
}
