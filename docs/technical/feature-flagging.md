# Feature Flagging

To ensure Desktop along without being blocked on design feedback, we need a way
to be able to ship features that are stable but not necessarily ready for
general usage. This document outlines what we should flag and how to flag
these features.

## What Should Be Feature Flagged?

A **preview feature** can be considered as:

 - something that has a well-defined scope
 - a consensus exists that the team is happy to proceed, but
 - some details need to be thought through or clarified

We're currently focused on user interface changes - new views, significant
changes to existing views, and so on. We can revisit this list when we
identify other cases where this sort of feature flagging needs to occur.

## Why not just ship it?

A few reasons:

 - some solutions just need time to appear, and this lets us get working code
   out quicker.
 - we want to get feedback easily - users can opt-in to these preview features.
 - we want to be conservative with evolving the UI - most users aren't fans of
   frequent, unnecessary churn.
 - if we don't like something we can pull it before people get too attached to
   it.

## How to Feature Flag?

At runtime your code should check [`enablePreviewFeatures()`](https://github.com/desktop/desktop/blob/2286edb0e1cf376ab81a1ffe02115abdde88527f/app/src/lib/feature-flag.ts#L6)
and either display the new feature or the existing one.

A simple example is the new clone experience in [#2436](https://github.com/desktop/desktop/pull/2436):

```ts
public render() {
  if (enablePreviewFeatures()) {
    return this.renderPreviewInterface()
  } else {
    return this.renderClassicInterface()
  }
}
```

This separation and naming scheme makes it easier to clean up the new or old
feature once things are stabilized.

## How to test

To opt-in for testing preview features, set the
`GITHUB_DESKTOP_PREVIEW_FEATURES` environment variable to any value and launch
the Desktop app.
