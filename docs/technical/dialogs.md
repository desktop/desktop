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
    <ButtonGroup>
      <Button type='submit'>Ok</Button>
      <Button>Cancel</Button>
    </ButtonGroup>
  </DialogFooter>
</Dialog>
```

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
    <ButtonGroup>
      <Button type='submit'>Ok</Button>
      <Button>Cancel</Button>
    </ButtonGroup>
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
    <ButtonGroup>
      <Button type='submit'>Ok</Button>
      <Button>Cancel</Button>
    </ButtonGroup>
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
    <ButtonGroup>
      <Button type='submit'>Ok</Button>
      <Button>Cancel</Button>
    </ButtonGroup>
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
