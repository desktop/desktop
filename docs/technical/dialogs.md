# Dialog

Dialogs are the high-level component used to render popups such as Preferences,
and repository setting as well as error messages. They're built upon the new
`dialog` html element and are shown as modals which means that tab navigation
are constrained to within the dialog itself.

## General structure

```jsx
<Dialog title='Title'>
  <TabBar>...</TabBar>
  <DialogContent>
    ...
  </DialogContent>
  <DialogFooter>
    <OkCancelButtonGroup />
  </DialogFooter>
</Dialog>
```

## Footer

A typical dialog footer will normally be made up of two buttons, an affirmative/Ok
button and a dismissal/Cancel button. The ordering of these two buttons is
platform-specific, see our [dedicated documentation about button order](button-order.md)
for the specifics. For this reason we have a dedicated component called
`OkCancelButtonGroup` which is used in the majority of our dialogs and renders
the buttons in the expected order for the platform.

For dialogs that only need a single button it's possible to use the `OkCancelButtonGroup`
but for simple dialogs it's probably better to replace the `DialogFooter` component
with the `DefaultDialogFooter` component which includes a single close button.

## OkCancelButtonGroup

The `OkCancelButtonGroup` is a high-level component which aims to eliminate the decision
making process around which order buttons should appear on the different platforms.

Used without any props the component will render two buttons, `Ok`, and `Cancel`. By
default the `Ok` button will trigger the `onSubmit` event on the `Dialog` and the `Cancel`
button will trigger the `onDismissed` event. It's possible to add a button-specific
event handler instead of relying on the dialog submit/dismiss events but it's rarely
necessary.

The `destructive` prop controls whether a dialog is considered destructive. One
definition of a destructive dialog is if the user chooses to answer the dialog in
the affirmative (`Ok`) whether the subsequent action be dangerous and/or hard to
recover from. Setting the `destructive` prop will make the dismissal (`Cancel`)
button the default button (i.e. it will be the submit button). Note that setting
the `destructive` prop does not impact which button triggers the `onSubmit` vs
`onDismissed` event on the dialog so converting a previously non-destructive dialog
to a destructive one is as simple as setting the prop on the button group.

## Errors

Dialogs should, when practical, render errors caused by its actions inline as
opposed to opening an error dialog. An example of this is the Preferences dialog.
If the dialog fails to write to the `.gitignore` or git config files as part of
persisting changes it renders a short error message inline in the dialog using
the `DialogError` component.

The `DialogError` component, if used, must be the first child element of the
Dialog itself.

```jsx
<Dialog title='Preferences'>
  <DialogError>Could not save ignore file. EPERM Something something</DialogError>
  <TabBar>...</TabBar>
  <DialogContent>
    ...
  </DialogContent>
  <DialogFooter>
    <OkCancelButtonGroup />
  </DialogFooter>
</Dialog>
```

The content inside of the `DialogError` should be primarily text based. Avoid using
the term 'Error' inside the text as that should be evident already based on the
styling of the `DialogError` component.

## Best practices

### DO: Let children render the `DialogContent` component

If you're using a one-child-per-tab approach you should render the `DialogContent`
as the top-level element in those children instead of wrapping children inside the
`DialogContent` element. This avoid needless nesting and lets us leverage generic
dialog/form/row styles in a more straightforward way.

#### Example (good)


```jsx
// SomeComponent.tsx
<Dialog title='Title'>
  <TabBar>...</TabBar>
  {this.renderActiveTab()}
  <DialogFooter>
    <OkCancelButtonGroup />
  </DialogFooter>
</Dialog>

// ChildComponent.tsx
<DialogContent>
  my fancy content
</DialogContent>
```

#### Example (bad)


```jsx
// SomeComponent.tsx
<Dialog title='Title'>
  <TabBar>...</TabBar>
  <DialogContent>
    {this.renderActiveTab()}
  </DialogContent>
  <DialogFooter>
    <OkCancelButtonGroup />
  </DialogFooter>
</Dialog>

// ChildComponent.tsx
<div>
  my fancy content
</div>
```

### DO: Use Row components to lay out content

The `Row` component receives a bottom margin, when used as an immediate
child of `DialogContent`, making it an excellent tool for structuring content.

If the content is primary text, as opposed to form component the `<p>` element
should be used instead of the `Row` component.
