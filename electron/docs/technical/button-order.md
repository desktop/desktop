# Platform specific button order

Since this version of Desktop was released, it has been particularly difficult to find a way for our buttons to conform to expectations across platform for Windows and macOS while also conforming to expectations based on whether the action is destructive. We're primarily referencing the macOS Human Interface Guidelines around [buttons](https://developer.apple.com/design/human-interface-guidelines/macos/buttons/push-buttons/) and [dialogs](https://developer.apple.com/design/human-interface-guidelines/macos/windows-and-views/dialogs/), and the Windows UX Guidelines for [buttons](https://docs.microsoft.com/en-us/windows/win32/uxguide/win-dialog-box#commit-buttons).

Windows and macOS have different approaches when it comes to positioning standard action buttons (such as Ok/Cancel) in dialogs.

On Windows, the default order is to put the affirmative action on the left side of dismissal button (Ok, Cancel) whereas macOS does the exact opposite (Cancel, Ok.). See [OK-Cancel or Cancel-OK? The Trouble With Buttons](https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/) for an overview of these differences.

We think it's important for GitHub Desktop to adhere to these platform-specific conventions in the vast majority of cases because users often rely on muscle memory when reacting to a dialog.

This is how we've interpreted our convention of how destructive and non-destructive dialogs should work on each platform based on these guidelines:

![button conventions](https://user-images.githubusercontent.com/5091167/68219886-f794ff80-ffa3-11e9-9f25-40a9bb2e9a71.png)

For more specific discussion of how our dialogs are implemented, please see the [dialogs documentation](https://github.com/desktop/desktop/blob/development/docs/technical/dialogs.md).

## Dangerous or destructive actions

Both Windows and macOS guidelines specifically call out the need for the default button to be the safest option when the action is dangerous or destructive. An example of such an action would be deleting a branch or removing a repository. In these cases, the default and initially selected button should never be the one that performs the destructive action. One exception we've made to this is when someone has explicitly tabbed to the button for a destructive action and then hits `Return` or `Enter`. In this case, we think the expectation of most people is that this will perform the destructive action, and therefore should select it to avoid confusion. We explained our reasoning for that in [this issue](https://github.com/desktop/desktop/issues/4187#issuecomment-552927923).
