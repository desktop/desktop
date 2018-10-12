# Organizing Desktop's Store Interactions For Great Good

I've been pondering on what to do with our representations of stores in the
codebase, given these components are important to how data flow through the app.

## Scope

This document is focused on:

 - `AppStore` - the core component for managing state and dispatching actions
 - `GitStore` - a per-repository cache that also performs Git operations
 - `AccountsStore` - a backing store for managing and persisting accounts tracked in the app
 - `RepositoriesStore` - a backing store for managing and persisting repositories tracked in the app
 - `IssuesStore` - backing store for refreshing and caching open GitHub issues for each repository
 - `PullRequestsStore` - backing store for refreshing and caching open GitHub pull requests for each repository
 - `CloningRepositoriesStore` - component for tracking repository clones in the app
 - ~~`EmojiStore` - contains emoji lookup for use in UI components~~ deprecated
 - `GitHubUserStore` - backing store for refreshing and caching GitHub collaborators for each repository
 - `SignInStore` - component for tracking user sign-in state in the UI
 - ~~`RepositorySettingsStore` - backing store for repository-specific settings~~ deprecated
 - `TokenStore` - used by `AccountStore` to tidy up credentials, but mostly used
   for authenticating Git operations

## Concerns

 - we've used `Store` as a general term for components that don't manage
   application state
 - some `AppStore` methods do not actually update state, and only perform side
   effects
 - some `AppStore` methods have organically grown over time to be complex and
   hard to understand
 - some `AppStore` methods update repository state, others update the root state
 - `AppStore` does a mixture of explicit git operations and calling methods
   on `GitStore` - we should clarify which approach is preferred here and try
   to adhere to it
 - the `Dispatcher` and stores live under `app/src/lib` which suggests they can
   be used anywhere, but there are some indirect dependencies that only the renderer
   process offers (IndexedDB access, Electron APIs), and also overlooks that these
   are coupled to the application infrastructure.

We've talked about migrating over to use Redux or a similar library for managing
state, rather than our hand-rolled solution, but there's a few questions I have
that I'm actively thinking about:

 - decomposing a large application into many actions and reducers might end up
   with an excess of abstraction that is difficult to navigate in it's own way
 - can we settle on a pattern that feels natural for how Desktop is structured,
   rather than fighting with a pattern that doesn't fit?
 - can we use this transition to make it easier for others to roll out features
   that use application state in a reliable and consistent fashion?
 - can we ensure this process doesn't result in a slower app when it comes to
   interaction in the app?

## Roadmap

This is broken up into numerous stages, where the most obvious tasks are early
on, and the latter tasks are less clear currently. We're also breaking this up
into numerous stages and tasks so we can ship improvements incrementally,
rather than a massive PR that changes the world.

### Stage 1 - Tidy Up

This stage is mostly about organizing things better, and here's some tasks that
I've identified:

 - **renaming things that aren't `Store`s** - some classes in the codebase have
   been suffixed with `Store` out of convenience, but as I've been exploring I
   realise they can be named better. I'm open to feedback about these names, if
   you have better ideas.
    - ~~`EmojiStore` -> `EmojiCache` - this class is initialized at launch, with
    the emoji results being set in application state which is used by UI
    components, but it doesn't fit the typical pattern of responding to
    dispatcher events~~
    - `StatsStore` -> `StatsReporter` - this component does not touch
    application state, and it's actions can be considered side effects.
    - `IssuesStore` -> `IssuesCache` - this component does not touch
    application state or emit updates
    - ~~replace `RepositorySettingsStore` with a module containing it's
    functionality, as the component does not raise state changes. These
    functions can be moved closer to the components that need it for now.~~
 - decompose `app-state.ts` into separate code files - the source is over 700
   lines of interfaces, and breaking this up into separate files around what
   they represent.

### Stage 2 - Review and organize `IAppState` shape

The current shape of `IAppState` is relatively flat, and it'd be interesting to
see if we can organize some of the existing fields into more meaningful objects
that reflect the structure of the application. This should help us identify
actions and reducers that perform similar things if we continue down the `redux`
path.

Some ideas:

 - a `preferences` hash containing settings that the user manages

```ts
{
  'preferences': {
    readonly selectedShell: Shell,
    readonly selectedExternalEditor?: ExternalEditor,
    readonly selectedTheme: ApplicationTheme,
    readonly askForConfirmationOnRepositoryRemoval: boolean,
    readonly askForConfirmationOnDiscardChanges: boolean
  }
}
```

 - a `userInterface` has representing the current UI state

```ts
{
  'userInterface': {
    readonly windowState: WindowState
    readonly windowZoomFactor: number
    readonly appIsFocused: boolean
    readonly showWelcomeFlow: boolean
    readonly currentPopup: Popup | null
    readonly currentFoldout: Foldout | null
    readonly appMenuState: ReadonlyArray<IMenu>
    readonly sidebarWidth: number
    readonly commitSummaryWidth: number
    readonly titleBarStyle: 'light' | 'dark'
    readonly isUpdateAvailableBannerVisible: boolean
  }
}
```

### Stage 3 - Extract Functions from `AppStore`

`AppStore` currently rocks in at 4k lines of code, with 180 methods - ~60 of
which are private. It'd be great to figure out if there's functions in here that
we can make stateless and extract out of `AppStore`.

This has a few benefits:

 - **coupling** - by forcing us to extract functions, we identify code that is
 complex or tightly-coupled and might be buggy (race conditions, incorrect flow,
 etc)
 - **testability** - functions are easier to test in isolation when you don't
 have to setup the `AppStore` into the right state
 - **readability** - by extracting code into functions with meaningful names,
 the flow of data in `AppStore` becomes easier to reason about

At this point we're still not into shaping our code to fit the `redux` pattern,
but decomposing `AppStore` to extract functions might help us uncover candidates
for the next stage.

### Stage 4 - Introduce `redux` to handle some dispatcher work

This is where things get interesting. So rather than trying to rewrite the
`AppStore` and all the functionality it touches, what if we can setup this flow
within the app:

 - create a `redux` store alongside `AppStore` that has the same `IAppState`
   shape
 - identify a part of `IAppState` that we can port to the Redux pattern
 - implement actions and reducers to replace this functionality
 - switch the dispatcher to dispatch to the new store
 - when the new app store updates, merge the subset of changes it's responsible
   for into the `AppStore` changes and `emitUpdate()` as normal

Goals for this experiment:

 - define a baseline for responsiveness that we can measure
 - have a subset of work flowing through `redux` in production
 - ensure this experiment replaces a complex `AppStore` function (>50 lines of source)
 - ensure this baseline is maintained or improved by the transition

Benefits of this approach:

 - incrementally port functionality while continuing to ship
 - the redux pattern should help with getting `AppStore` under better test
   coverage than we have currently
 - identify patterns for things we do in Desktop and what solutions exist out
   there that feel natural (`redux-thunk`, `redux-saga`, etc)

Unknowns/Risks:

 - managing two app stores might be problematic - how can we mitigate doing
   duplicate work or merging state changes in an incorrect way? there may be
   ways to have acceptance tests around this.
 - as we port usage to `redux` we might uncover things that we do in `AppStore`
   that don't map well to the `redux` model.
 - much of the dispatcher actions are based around a repository, whereas `redux`
   components like reducers are shaped around the root state object - how will
   that complicate things? can we experiment with that?

### Beyond

There's probably more things to think about once we're in a good place with
`redux`, like:

 - introduce `react-redux` usage and complete the cycle
 - standardize and document how we roll out features that touch application
   state (requires significant knowledge of internals currently)



