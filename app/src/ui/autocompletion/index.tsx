export { default as AutocompletingTextArea } from './autocompleting-text-area'

export interface IAutocompletionProvider<T> {
  getRegExp(): RegExp
  getAutocompletionItems(text: string): ReadonlyArray<T>
  renderItem(item: T): JSX.Element
}
