# Issue Triage

Incoming issues should be grouped into one of these buckets:

## Bugs

These are problems with the current app that are identified by users. These
should be reviewed to ensure they:

 - specify the build associated with the issue
 - have instructions sufficient to reproduce the issue
 - have details about the impact and severity of the issue

We will use the `more-information-needed` and `reproduction-required` labels to
indicate when issues are incomplete.

Once enough detail has been captured about the issue, and it can be reproduced
by one of the maintainers, these should be prioritised by the team. Severe bugs
or bugs affecting many users would be prioritised above minor or low impact
bugs.

## Enhancements

Changes or improvements to existing features of the application are generally
fine, but should have some review process before they are implemented.
Contributors are encouraged to open issues to discuss enhancements so that other
contributors can see and participate in the discussion, and the core team can
remain transparent about the interactions.

To ensure the quality of the application remains high over time, the core team
may need to work with the user proposing the change to clarify details before
work should proceed:

 - user interface - appropriate use of styles, layout
 - user experience - ensure things are consistent, discoverable
 - quality - ensure the change does not adversely affect other features

e.g. GitHub Desktop should support worktrees as a first class feature.

For work that we may evaluate post-1.0, we will label the issue `future-work`
and close it out, to keep our short-term backlog under control.

## Out-of-scope

We anticipate ideas or suggestions that don't align with how we see the
application evolving, so we may close issues with an explanation of why.

e.g. GitHub Desktop should support working with Mercurial repositories.
