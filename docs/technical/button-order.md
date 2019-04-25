# Platform specific button order

Windows and macOS have different approaches when it comes to positioning standard action buttons (such as Ok/Cancel) in dialogs.

On Windows the default order is to put the affirmitive action on the left side of dismissal button (i.e Ok, Cancel) whereas macOS does the exact opposite (i.e. Cancel, Ok.). See [OK-Cancel or Cancel-OK? The Trouble With Buttons](https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/) for an overview of these differences.

We believe it's important that GitHub Desktop adheres to these platform-specific conventions since users often rely on muscle memory when reacting to a dialog.

## Dangerous or destructive actions

macOS interface guidelines specifically call out the need for a separate treatment of action buttons when the associated action is dangerous or destructive. An example of such an action would be deleting a branch.
