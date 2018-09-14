# Application Structure

This document is a work in progress but covers where things can be found and
explains how things are organized in the GitHub Desktop source.

**Note:** this is an aspirational document and to be used as a starting point
for discussions, and doesn't currently reflect reality.

## `app/src`

I'm going to walk through these in the order in what might look like a strange
order, but hopefully it makes sense by the end.

## Shared Modules

These folders should contain modules that can be shared across any of the
Webpack bundles that Desktop generates.

 - `app/src/models` - contains the shapes used in the codebase to represent
common objects. They should be immutable and plain.

 - `app/src/lib` - contains functions that do not depend on executing in a
 specific environment.

In some cases, such as the main and renderer processes using IPC (inter-process
communication), we want to ensure the shapes of objects being sent are
consistent. For logic or features associated with a specific bundle and not
intended to be shared across bundles, these should follow the same pattern and
live within a `models` or `lib` folder within the given bundle directory.

## Application Bundles

I'm referring to these folders as "bundles" because our webpack config will
transpile a specific file in each of these directories to generate what it
needs to package and run the application.

### Main Process - `app/src/main-process`

Modules and logic to be bundled for the main process, which is the entry point
for the user to launch Desktop.

### User Interface - `app/src/renderer`

Modules and logic to be bundled for the renderer process, which displays the
user interface and handles most of the data management in Desktop.

As the largest part of the current codebase, I've sketched out how the folders
within `app/src/renderer` may be organized:

 - app
    - src
       - renderer
          - components
            ... 
            - dialogs
            - primitives
            - text
            ...
          - lib
             - git
          - models
          - stores
          - views

There's a lot of opinions out there about how to structure React projects, but
for the moment I wanted to focus on addressing these problems:

 - better organization of our React components
 - better organization of modules required by the renderer process
 - clarification of modules that can be shared between parts of the app, and
   things that make sense to keep specific to one part of the app
 - reflect our current usage patterns
    - Git operations performed in the renderer
    - stores created and managed in the renderer

What lives in each of these folders:

 - `components` - contains the React components used in our application. I don't
   have strong opinions on how to organize these, but better organizing of these
   would simplify our imports elsewhere. I've also mentioned subdirectories that
   might represent new groups of related components, based on existing components
 - `lib` - functions and logic specific to the renderer process
 - `lib/git` - our current Git functionality, localized for use in the renderer
 - `models` - interfaces and classes specific to the renderer process
 - `stores` - our existing collection of stores from `lib/stores`
 - `views` - these are the top-level components that we render based on the state
   of the repository - `repository.tsx`, `cloning-repository.tsx` and 
   `missing-repository.tsx`

The entry point `index.tsx` should be available at the root, but everything else
should be moved to a more relevant location on disk.

### Highlighter worker - `app/src/highlighter`

Module and logic associated with the highlighter web worker that Desktop
initializes to perform asynchronous computation of syntax highlighting in diffs.

### Crash Window - `app/src/crash`

Modules and logic that Desktop uses to show a default UI when an unhandled error
occurs that crashes the main application.

### AskPass script - `app/src/ask-pass`

Modules and logic that Desktop uses to act as a credential helper for it's Git
operations, bypassing whatever the user has set in config. This is a separate
component because Desktop will spawn Git which can only spawn another program,
so Desktop sets this script as the program to execute if Git encounters an
authentication prompt.

### Command Line Interface - `app/src/cli`

Module and logic to be bundled for the `github` command line interface that
users can enable for Desktop

