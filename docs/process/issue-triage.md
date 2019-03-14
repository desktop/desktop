# Issue Triage

> Triage (/ˈtriːɑːʒ/ or /triːˈɑːʒ/) is the process of determining the priority
> of patients' treatments based on the severity of their condition. This
> rations patient treatment efficiently when resources are insufficient for all
> to be treated immediately.
>
> *From Wikipedia*

The above describes medical triage but it is clear that it also applies to our
situation. Triage is a process of sifting through all the things that we could
work on to select the few things that we will work on. In order to maximize the
impact we have for the people that use GitHub Desktop, things that will get top
priority are items that are well-described, clearly presented and have obvious
benefit.

Additionally, we want to encourage helpful feedback and meaningful
participation. In order to do this, we will have to be clear about what we need
from people so that we can deliver what they need. This also means that we will
have to be very clear and decisive when we are not getting the information or
cooperation we need so that we can move on. Just like in an emergency room, if
it is a choice between spending several hours to have a 10% chance of saving
one person or spending several hours definitely saving multiple people, the
choice is clear.

## Goals

* Communicate clearly and effectively
    * What the maintainers will work on
    * What pull requests will be reviewed for acceptance
    * What pull requests *will not* be reviewed for acceptance
* Outline exactly what is expected for an issue to meet the "triage bar" so
  that issues that don't meet the bar can be closed
* Reduce the amount of time and back-and-forth needed to take an issue from
  being first-opened to `triaged` or closed
* Accept input from the community that helps us deliver meaningful results to
  GitHub Desktop and its users

## The Issues List Is Our Backlog

The GitHub Desktop issues list is what the maintainers team uses to guide our
work. In order for our work to be focused and efficient, our issues list must
be clean and well-organized. Accepting input from the community is a
significant benefit *when it does not distract us from making things better*.

* Untriaged issues are tasks that are being evaluated to determine if they meet
  the triage bar
* Open triaged issues are tasks that the maintainers have agreed to work on
* Closed issues are things that either didn't meet the triage bar or are tasks
  that the maintainers will not be taking on

## The Triage Bar

In order to be considered triaged an issue **must** contain or be edited to
contain in the body of the issue:

* The build number associated with the given issue
* The operating system and OS version number that the problem was reproduced on
* Specific steps to reproduce the problem or desired behavior
* If the steps to reproduce the problem do not reproduce it 100% of the time,
  an estimate of how often it reproduces with the given steps and configuration
* **One** and only one issue
* Any other information that is required to reproduce the problem (sample Git
  repository, specific OS configuration, etc)

### The Body of the Issue

You'll notice above that the body of the issue gets special mention. The body
of the issue is the description of the task to be done. A maintainer should
only have to read the body of the issue to understand what needs to happen.
They should not have to read the pages of comments to understand what they need
to do in order to address the issue at hand.

## Process

Keep in mind that this is not the 100% complete maintainer's guide to issues.
This is only a triage process. Once everything has been checked, the issue
reproduced and appropriate labels have been applied, the triage process is done
with the issue. There may be additional maintenance that needs to be done on
issues from time to time that isn't and won't be covered here.

1. Person files a new issue
1. Maintainer checks to ensure they adequately filled out the template. If not,
   close with a request to fill out the template.
1. Label the issue as a `bug` if the issue is a regression or behaviour that
   needs to be fixed.
1. Label the issue with `support` if the issue is specific to one person's
   configuration and isn't more broadly relevant to other users.
1. If the issue has already been fixed, add a comment linking to the original
   issue and close the issue.
1. If anything is unclear but the template is adequately filled out, post what
   questions you have and label with `more-information-needed`.
1. Maintainer attempts to reproduce the problem
    1. If the problem is not reproducible, label with `needs-reproduction` and
       ask the author of the issue for clarification on the repro steps.
1. Label the issue as an `enhancement` if the issue mentions new behaviour
   or functionality that the app should have.

# Labels

## More Information Needed

If a reviewer cannot understand or reproduce the issue with the information provided, they should add a comment indicating what is not clear and add the label `more-information-needed`.

Although we use a bot, the first responder should also do a manual sweep of issues that are open and labeled `more-information-needed` at least once a week.
* If a `more-information-needed` issue is stale for more than 14 days after the last comment by a reviewer, the issue will be automatically closed by the no-response bot.
* If the original poster did not fill out the issue template and has not responded to our request within 7 days, close the issue with the following message `I'm closing the issue due to inactivity but I'm happy to re-open if you can provide more details.`

## Support

If an issue reported feels specific to one user's setup and a solution will likely not be relevant to other users of Desktop, the reviewer should add the label `support`
and @-mention @desktop/support so they're able to work with the user to figure out what's causing the problem.

## Needs Reproduction

If a problem is consistently not reproducible, we **need** more information
from the person reporting the problem. If it isn't a simple misunderstanding
about the steps to reproduce the problem, then we should label it
`more-information-needed` as well and follow that process.

## Bugs

These are problems with the current app that are identified by users. These
should be reviewed to ensure they:

 - specify the build associated with the issue
 - have instructions sufficient to reproduce the issue
 - have details about the impact and severity of the issue

We will use the `more-information-needed` and `reproduction-required` labels to
indicate when issues are incomplete.

Once enough detail has been captured about the issue, and it can be reproduced
by one of the maintainers, these should be prioritized by the team. Severe bugs
or bugs affecting many users would be prioritized above minor or low impact
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

### Future Proposals

The Desktop team has a [roadmap](roadmap.md) defined for the next few releases,
so that you can see what our future plans look like. Some enhancements suggested
by the community will be for things that are interesting but are also well
beyond the current plans of the team.

We will apply the `future-proposal` label to these issues, so that they can be
searched for when it comes time to plan for the future. However, to keep
our issue tracker focused on tasks currently on the roadmap we will close these
future proposals to avoid information overload.

You can view [the list](https://github.com/desktop/desktop/issues?q=is%3Aissue+label%3Afuture-proposal)
of these `future-proposal` tasks, and continue to add your thoughts and feedback
there.

## Out-of-scope

We anticipate ideas or suggestions that don't align with how we see the
application evolving, so we may close issues with an explanation of why.

e.g. GitHub Desktop should support working with Mercurial repositories.
