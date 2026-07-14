# Error Reporting

First we need to make the distinction between expected runtime _errors_ and
_exceptions_. Unfortunately both are represented with the `Error` class, but
they're conceptually different. Exceptions are fatal, errors are not.

The story around exceptions is simpler so let's start there.

## Exceptions

An exception is an unexpected, fatal problem in the app itself. For example, our
old friend `undefined is not a function`. This is a problem with the code itself
which cannot be resolved at runtime. Our only option is to quit the app and
relaunch.

We handle uncaught exceptions by registering a [global listener](https://github.com/desktop/desktop/blob/fb4e73560127f491ccf5f59984a310481911f2b6/app/src/ui/index.tsx#L75).
We report the exception to Central, tell the user that an unrecoverable error
happened, and then quit and relaunch. End of story.

## Errors

Errors are a bit more involved. They are anything that can go wrong in the
standard usage of the app. For example, if the internet's down or a git
repository is in a funny state, we're gonna get some errors.

Our error reporting flows through the `Dispatcher` like most everything in the
app. [`postError`](https://github.com/desktop/desktop/blob/fb4e73560127f491ccf5f59984a310481911f2b6/app/src/lib/dispatcher/dispatcher.ts#L308)
calls the [registered](https://github.com/desktop/desktop/blob/fb4e73560127f491ccf5f59984a310481911f2b6/app/src/lib/dispatcher/dispatcher.ts#L711)
[error handlers](https://github.com/desktop/desktop/blob/fb4e73560127f491ccf5f59984a310481911f2b6/app/src/lib/dispatcher/error-handlers.ts),
starting with the most recently registered. The error handlers have the chance
to pass the error through untouched, return a different or more specific error,
or swallow the error entirely.

Error handlers must have the following type:

```typescript
export async function myCoolErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  // code goes here
}
```

If an error passes through all the registered error handlers, the final error
handler will call [`Dispatcher#presentError`](https://github.com/desktop/desktop/blob/75445ea61177347b2df08e846aae30e637d5f1de/app/src/lib/dispatcher/dispatcher.ts#L334).
That will present the generic error dialog to the user.

```
+------------------------+
|                        |
|  Dispatcher#postError  |
|                        |
+------------------------+
            |
            |
   +------------------+     +--------------------+
   |                  |     |                    |
   |  error handlers  |-----| do something else  |
   |                  |     |                    |
   +------------------+     +--------------------+
            |
            |
+-------------------------+
|                         |
| Dispatcher#presentError |
|                         |
+-------------------------+
```

### `Error` subclasses

We define some `Error` subclasses that are used in the codebase use to provide
more context to error handlers:

* [`GitError`](https://github.com/desktop/desktop/blob/75445ea61177347b2df08e846aae30e637d5f1de/app/src/lib/git/core.ts#L62) -
wraps a raw `Error` raise by `dugite` with additional git information.
* [`ErrorWithMetadata`](https://github.com/desktop/desktop/blob/75445ea61177347b2df08e846aae30e637d5f1de/app/src/lib/error-with-metadata.ts) -
wraps an existing `Error` with additional metadata.

In addition to the global information like the repository associated with the
error, `ErrorWithMetadata` supports providing additional details:

 - a [`RetryAction`](https://github.com/desktop/desktop/blob/75445ea61177347b2df08e846aae30e637d5f1de/app/src/lib/retry-actions.ts)
  can be set to let the user retry the action that previously failed, allowing
  error handlers the ability to retry whatever action caused the error.
 - a [`IGitErrorContext`](https://github.com/desktop/desktop/blob/c60350c52daeab04fe9e8743c5a5079bc87daa0e/app/src/lib/git-error-context.ts)
  can be set to add custom details about the Git operation that failed, so that
  error handlers have more context to provide the user about how to recover

