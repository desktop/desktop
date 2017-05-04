# Issue Triage

Incoming issues should be grouped into one of these buckets:

## Defects

These are problems with the current app that are identified by users. These
should be reviewed to ensure they:

 - specify the build associated with the issue
 - have instructions sufficient to reproduce the issue
 - have details about the impact and severity of the issue

Once enough detail has been captured, these should be prioritised by the team.
Severe bugs or bugs affecting many users would be prioritised above minor or low
impact bugs. Depending on the estimate for the work required, some bugs may not
necessarily need to be done by the core team. These could be marked as
`up-for-grabs` so that external contributors could get involved.

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

## Out-of-scope

We anticipate ideas or suggestions that don't align with how we see the
application evolving, so we may close issues.

e.g. GitHub Desktop should support working with Mercurial repositories.
