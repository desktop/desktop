import memoizeOne from 'memoize-one'
import * as React from 'react'

export interface IDialogStackContext {
  /** Whether or not this dialog is the top most one in the stack to be
   * interacted with by the user. This will also determine if event listeners
   * will be active or not. */
  isTopMost: boolean
}

/**
 * The DialogStackContext is used to communicate between the `Dialog` and the
 * `App` information that is mostly unique to the `Dialog` component such as
 * whether it is at the top of the popup stack. Some, but not the vast majority,
 * custom popup components in between may also utilize this to enable and
 * disable event listeners in response to changes in whether it is the top most
 * popup.
 *
 * NB *** React.Context is not the preferred method of passing data to child
 * components for this code base. We are choosing to use it here as implementing
 * prop drilling would be extremely tedious and would lead to adding  `Dialog`
 * props on 60+ components that would not otherwise use them. ***
 *
 */
export const DialogStackContext = React.createContext<IDialogStackContext>({
  isTopMost: false,
})

/**
 * A base component for any dialogs that consume the dialog stack context.
 *
 * This houses logic to respond to when the `isTopMost` changes on the
 * `DialogStackContext` by providing two abstract methods of `onDialogIsTopMost`
 * and `onDialogIsNotTopMost` and implementing a `checkWhetherDialogIsTopMost
 * method that called via the components implementations of React component
 * lifecycle methods.
 */
export abstract class DialogStackContextConsumer<K, T> extends React.Component<
  K,
  T
> {
  public static contextType = DialogStackContext
  public declare context: React.ContextType<typeof DialogStackContext>

  protected checkWhetherDialogIsTopMost = memoizeOne((isTopMost: boolean) => {
    if (isTopMost) {
      this.onDialogIsTopMost()
    } else {
      this.onDialogIsNotTopMost()
    }
  })

  /** The method called when the dialog is the top most in the stack. */
  protected abstract onDialogIsTopMost(): void

  /** The method called when the dialog is not top most in the stack. */
  protected abstract onDialogIsNotTopMost(): void

  public componentDidUpdate(
    _prevProps?: Readonly<any>,
    _prevState?: Readonly<{}>,
    _snapshot?: any
  ): void {
    this.checkWhetherDialogIsTopMost(this.context.isTopMost)
  }

  public componentDidMount() {
    this.checkWhetherDialogIsTopMost(this.context.isTopMost)
  }

  public componentWillUnmount() {
    this.onDialogIsNotTopMost()
  }
}
