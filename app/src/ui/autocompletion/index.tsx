import AutocompletingTextInput from './autocompleting-text-input'

export class AutocompletingTextArea extends AutocompletingTextInput<HTMLTextAreaElement> {
  protected getElementTagName(): 'textarea' | 'input' { return 'textarea' }
}
export class AutocompletingInput extends AutocompletingTextInput<HTMLInputElement> {
  protected getElementTagName(): 'textarea' | 'input' { return 'input' }
}

/** An interface which defines the protocol for an autocompletion provider. */
export interface IAutocompletionProvider<T> {
  /**
   * Get the regex which it used to capture text for the provider. The captured
   * text will then be passed to `getAutocompletionItems` to get the
   * autocompletions.
   */
  getRegExp(): RegExp

  /**
   * Get the autocompletion results for the given text. The text is whatever was
   * captured by the regex returned from `getRegExp`.
   */
  getAutocompletionItems(text: string): ReadonlyArray<T>

  /**
   * Render the autocompletion item. The item will be one which the provider
   * returned from `getAutocompletionItems`.
   */
  renderItem(item: T): JSX.Element
}
