declare module 'textarea-caret' {
  interface ICaret {
    top: number
    left: number
    height: number
  }

  function getCaretCoordinates(element: HTMLElement, position: number): ICaret
  export = getCaretCoordinates
}
