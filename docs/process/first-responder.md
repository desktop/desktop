# First Responder Rotation

We have a first responder rotation, aka FRR. The goals of the rotation are:

1. Ensure community issues and PRs are answered in a timely manner.
1. Ensure support load is shared across the whole team.
1. Free up the rest of the team to focus on milestone work.
1. Give everyone a regular break from milestone work.

Each rotation is a week long. While first responder your primary duties are:

1. Triage issues.
    * The current first responder is not responsible for following up on issues still open from previous first responders. However, they should highlight to the team the issues that have been left unanswered for at least 5 days
    from previous responders to increase visibility and potentially point out which are highest priority.
    * At mention @desktop/support and add `support` label if the issue feels applicable to only the user reporting it, and isn't something more broadly relevant.
    * Ensure issues are labeled accurately.
    * Review issues labeled [`reviewer-needs-to-reproduce`](https://github.com/desktop/desktop/issues?utf8=%E2%9C%93&q=is%3Aopen+is%3Aissue+sort%3Aupdated-asc+label%3Areviewer-needs-to-reproduce) and close any that have gone 2 weeks with no new activity after the last question by a reviewer.
    * Review issues labeled [`more-information-needed`](https://github.com/desktop/desktop/issues?q=is%3Aopen+is%3Aissue+label%3Amore-information-needed+sort%3Aupdated-asc) and close any that have gone 7 days without an issue template being filled out. Otherwise, the `no-response` bot will close it after 2 weeks.
    * See [issue-triage.md](issue-triage.md) for more information on our issue triage process.
1. Check community pull requests and label ones that are `ready-for-review`.

Once those things are done, you should feel free to spend your time scratching your own itches on the project. Really wanna refactor that one monstrous component? Go for it! Wanna fix that one bug that drives you nuts? Do it! Wanna upgrade all of our dependencies? You're an awesome masochist!

That said, tasks which need design work generally *aren't* well-suited to this. It would pull our fantastic designers away from milestone work and it would be hard to get done in a week's time.

If you're at a loss for ideas or wonder if something is an appropriate first responder task, ask the rest of the team! Or poke through the [`tech-debt`](https://github.com/desktop/desktop/labels/tech-debt) label for some inspiration.
