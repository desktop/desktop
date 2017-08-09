declare module 'textarea-caret' {
  interface Caret {
    top: number
    left: number
    height: number
  }

  function getCaretCoordinates(element: HTMLElement, position: number): Caret
  export = getCaretCoordinates
}
