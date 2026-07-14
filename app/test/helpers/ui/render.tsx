import * as React from 'react'

// This import MUST stay here — it runs side-effects that every UI test needs:
// polyfilling ResizeObserver, aligning globalThis.Event/CustomEvent with jsdom,
// and registering an afterEach(cleanup) hook. Tests should never import
// '@testing-library/react' directly; they should import from this module
// instead so these side-effects are guaranteed to run first.
import './setup'

import {
  fireEvent,
  render as rtlRender,
  type RenderOptions,
  screen,
  waitFor,
  within,
} from '@testing-library/react'

type UIErrorRenderOptions = Omit<RenderOptions, 'queries'>

/**
 * Thin wrapper around Testing Library's render.
 *
 * This exists so that every test imports from this module rather than directly
 * from '@testing-library/react'. Importing from here guarantees the './setup'
 * side-effects (ResizeObserver polyfill, Event/CustomEvent alignment, and
 * afterEach cleanup) have already executed before any component is rendered.
 */
export function render(
  element: React.ReactElement,
  options?: UIErrorRenderOptions
) {
  return rtlRender(element, options)
}

export { fireEvent, screen, waitFor, within }
