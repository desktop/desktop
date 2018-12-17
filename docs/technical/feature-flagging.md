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

A **beta feature** should be:

- a feature that is slated for an upcoming release, and
- is usably complete, but
- needs more testing, or
- needs to be used to see how it feels

Beta features are a superset of preview features.

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

First add a new function to [feature-flag.ts](https://github.com/desktop/desktop/blob/3ee29eb1bd083a53f69fdbec2e2b10ec93404e44/app/src/lib/feature-flag.ts#L30). The function should usually check `enableDevelopmentFeatures()` or `enableBetaFeatures()`. Then, at runtime, your code should check either your feature flag function and either display the new feature or the existing one.

See pull request integration in [#3339](https://github.com/desktop/desktop/pull/3339) for an example.

This separation and naming scheme makes it easier to clean up the new or old
feature once things are stabilized.

## How to test

**Opting-in for preview features**
1. Set the `GITHUB_DESKTOP_PREVIEW_FEATURES` environment variable to `1`
1. Restart GitHub Desktop

Don't have that environment variable?
No worries, simply create it. (here's a [handy guide](https://www.schrodinger.com/kb/1842) for doing that on most major OSs).

**Opting-out for preview features**
1. Remove the `GITHUB_DESKTOP_PREVIEW_FEATURES` environment variable
1. Restart GitHub Desktop



