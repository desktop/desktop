# Windows Menu Bar

One of the design decision early on with GitHub Desktop assumed a high-fidelity
application menu. On macOS we get that for free since the application menu is
detached from the application (visually) and anchored at the top of the screen.
On Windows, things aren't quite as simple.

Since we wanted a "frameless" design on Windows we explored putting the
application menu behind a hamburger icon in [#689](https://github.com/desktop/desktop/pull/689)
which worked decently until the advent of the separate title bar in [#775](https://github.com/desktop/desktop/pull/775) which was introduced so that
there would be draggable areas of the window even when running on small resolutions.

Ultimately we decided that the familiar UX of a menu bar was superior to anything
we had tried up until that point.

The first iteration of this menu bar was implemented in [#991](https://github.com/desktop/desktop/pull/991) and this document serves to
document what a Windows menu bar is supposed to do such that we can detect
regressions going forward.

## The basics

The menu bar should display the top-level menu items and each menu item
should be clickable. When clicking on a menu item the associated sub menu
should expand (or collapse if already open).

## Keyboard navigation

When a user is holding down the <kbd>Alt</kbd> key the access-keys (which is separate from
accelerator or "shortcut" keys) in the top-level menu items should be underlined.

![underlined access keys](https://cloud.githubusercontent.com/assets/634063/24377826/02f7cb34-1341-11e7-9514-4b229372f985.png)

Pressing, and holding down, <kbd>Alt</kbd> followed by one of the access keys in the top
level menu should expand that menu. The menu should now be put in such as state
that menu items in sub menus have their access keys highlighted as well.

If a menu is opened using <kbd>ALT</kbd>+<kbd>X</kbd> (where x is an access key for a top level menu
item) a user should be able to activate (execute) its sub menu items should by
pressing the corresponding access key. Note, however, that this key should *not*
be used in conjunction with the <kbd>Alt</kbd> key. In other words, to execute the
File -> New Branch item a user should be able to press <kbd>ALT</kbd>+<kbd>F</kbd>
followed by <kbd>B</kbd>.

Pressing the <kbd>Alt</kbd> key and releasing it without pressing an access key should
put focus on the first top level menu item if no menu is currently expanded. If
any menus are expanded pressing <kbd>Alt</kbd> should immediately close any open menus.

![focused menu item](https://cloud.githubusercontent.com/assets/634063/24378079/f6bff85e-1341-11e7-8d79-dbc8681fa9f0.png)

Pressing and releasing the <kbd>Alt</kbd> key while a top level menu item is focused should
remove keyboard focus from the item.

### Focused top-level menu items

When a top-level menu item has keyboard focused (and its menu is collapsed) a
user should be able to expand the menu by pressing <kbd>Enter</kbd> or <kbd>↓</kbd>.

Using the <kbd>←</kbd> and <kbd>→</kbd> keys should move focus to the next
adjacent menu item in that direction, looping around if necessary.

### Expanded menus

An expanded menu respond to <kbd>↑</kbd> and <kbd>↓</kbd>, moving the selection
to the next adjacent menu item in that direction, looping around if necessary.

Hitting <kbd>Enter</kbd> or <kbd>Space</kbd> should execute the currently selected menu item.

<kbd>→</kbd> should open a submenu if the currently selected item has one and
move selection (and focus) to the first item in that submenu. If the current
item does not have a submenu <kbd>→</kbd> should have no effect.
Similarly <kbd>←</kbd> should close the currently open submenu and move focus
back to the sub-menu's parent item.

#### Pointer device interactions

Menu item selection should follow the pointer device so that pointing on a menu
item automatically selects it. Moving outside of a menu should not close the menu.

If a user points at a menu item which has a submenu of its own the selection
should immediately switch to that menu item but the sub menu should not expand
until a reasonable amount of time (currently 300ms) has passed so that a user
can move their pointer from one menu item to the submenu item without activating
any submenus in their path.
