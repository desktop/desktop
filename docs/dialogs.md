# Dialog

## General structure

```html
<Dialog title='Title'>
  <TabBar>...</TabBar>
  <Form>
    <DialogContent>
      ...
    </DialogContent>
    <DialogFooter>
      <ButtonGroup>
        <Button type='submit'>Ok</Button>
        <Button>Cancel</Button>
      </ButtonGroup>
    </DialogFooter>
  </Form>
</Dialog>
```

### Form example

## Best practices

### DO: Let children render the DialogContent component

If you're using a one-child-per-tab approach you should render the DialogContent
as the top-level element in those children instead of wrapping children inside the
DialogContent element. This avoid needless nesting and lets us leverage generic
dialog/form/row styles in a more straightforward way.

#### Example (good)


```html
<!-- SomeComponent.tsx -->
<Dialog title='Title'>
  <TabBar>...</TabBar>
  <Form>
    {this.renderActiveTab()}
    <DialogFooter>
      <ButtonGroup>
        <Button type='submit'>Ok</Button>
        <Button>Cancel</Button>
      </ButtonGroup>
    </DialogFooter>
  </Form>
</Dialog>
<!-- ChildComponent.tsx -->
<DialogContent>
  my fancy content
</DialogContent>
```

#### Example (bad)


```html
<!-- SomeComponent.tsx -->
<Dialog title='Title'>
  <TabBar>...</TabBar>
  <Form>
    <DialogContent>
      {this.renderActiveTab()}
    </DialogContent>
    <DialogFooter>
      <ButtonGroup>
        <Button type='submit'>Ok</Button>
        <Button>Cancel</Button>
      </ButtonGroup>
    </DialogFooter>
  </Form>
</Dialog>
<!-- ChildComponent.tsx -->
<div>
  my fancy content
</div>
```

### DO: Use Row components to lay out content

The `Row` component receives a bottom margin, when used as an immediate
child of `DialogContent`, making it an excellent tool for structuring content.
