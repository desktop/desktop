# Issue and Pull Request Labels

This section outlines the labels currently used in the project, and adds context
about what each label represents.

## Areas of Work

These labels are used for both issues and pull requests, and are assigned to
help identify what area a task is associated with. This helps organize upcoming
work and enables contributors to focus on a specific area of the project that
they are passionate about.

|                                       | Label name               | Description |
| ------------------------------------- | -------------------------| ----------- |
| [:mag_right:][area:accessibility]     | `area:accessibility`     | Accessibility issues or improvements in the product |
| [:mag_right:][area:dependencies]      | `area:dependencies`      | Upgrading dependencies that the project uses |
| [:mag_right:][area:diffs]             | `area:diffs`             | Diff rendering and our use of [CodeMirror](https://codemirror.net/) |
| [:mag_right:][area:docs]              | `area:docs`              | Documentation for the project |
| [:mag_right:][area:electron]          | `area:electron`          | How we use [Electron](https://electronjs.org) in the product |
| [:mag_right:][area:enhancements]      | `area:enhancements`      | Improvements to the product that address a specific problem for users |
| [:mag_right:][area:external-websites] | `area:external-websites` | External websites that the GitHub maintainers are responsible for |
| [:mag_right:][area:integrations]      | `area:integrations`      | Editor and shell integrations that ship in the product |
| [:mag_right:][area:metrics]           | `area:metrics`           | Required to support analytics and metrics in the product |
| [:mag_right:][area:performance]       | `area:performance`       | Improvements to the product to ensure it is responsive for users|
| [:mag_right:][area:tech-debt]         | `area:tech-debt`         | Keep the application code maintainable so contributors can continue building features |
| [:mag_right:][area:themes]            | `area:themes`            | The light or dark themes that ship in the product  |
| [:mag_right:][area:tooling]           | `area:tooling`           | Scripts and tooling for the project |

## Issue triage

The triage process is how the maintainers process incoming issues and prioritize
the work required to address the feedback raised. These labels help us to track
the flow of an issue through this process

|                                               | Label name                       | Description |
| --------------------------------------------- | ---------------------------------| ----------- |
| [:mag_right:][triage:more-information-needed] | `triage:more-information-needed` | The submitter needs to provide more information about the issue to understand the behavior |
| [:mag_right:][triage:potential-bug]           | `triage:potential-bug`           | Issue contains enough details for a reviewer to try and reproduce the problem |
| [:mag_right:][triage:confirmed-bug]           | `triage:confirmed-bug`           | Issue contains reproducible steps and bug has been verified by a reviewer |
| [:mag_right:][triage:not-a-bug]               | `triage:not-a-bug`               | Issue is not related to a bug, and requires review from `@desktop/product` to determine the next steps |
| [:mag_right:][impact:priority-1]              | `impact:priority-1`              | Major bug affecting large population and inhibiting their work |
| [:mag_right:][impact:priority-2]              | `impact:priority-2`              | Bug that affects more than a few users in a meaningful way but doesn't prevent core functions |
| [:mag_right:][impact:priority-3]              | `impact:priority-3`              | Bugs that affect small number of users and/or relatively cosmetic in nature |
| [:mag_right:][support]                        | `support`                        | Issues specific to an individual users' configuration requiring diagnosis and clarification to resolve |

## External contributions

We use these labels to identify work that is ideal for external contributors to
get involved with.

|                                 | Label name         |  Description |
| ------------------------------- | ------------------ |  ----------- |
| [:mag_right:][good first issue] | `good first issue` | Issues marked as ideal for a brand new contributor to start with |
| [:mag_right:][help wanted]      | `help wanted`      | Issues marked as ideal for external contributors |

## Collaboration

We use these labels to track tasks that represent specific interactions as part of a productive cross-functional team:

|                                                 | Label name                         |  Description |
| ----------------------------------------------- | ---------------------------------- |  ----------- |
| [:mag_right:][collaboration:user-research]      | `collaboration:user-research`      | Issues that may benefit from user interviews, validations, and/or usability testing |
| [:mag_right:][collaboration:needs-design-input] | `collaboration:needs-design-input` | Issues that require design input from the core team before the work can be started |

## Platforms

Sometimes issues are isolated to a specific operating system. We use these
labels to help identify these issues, so maintainers with that setup - or
experience with that setup - can easily find them in the issue tracker.

|                                 | Label name          | Description |
| ------------------------------- | ------------------- | ----------- |
| [:mag_right:][platform:linux]   | `platform:linux`    | Issues specific to Desktop usage on Linux |
| [:mag_right:][platform:macOS]   | `platform:macOS`    | Issues specific to Desktop usage on macOS |
| [:mag_right:][platform:windows] | `platform:windows`  | Issues specific Desktop usage on Windows |


## Review Process

These labels should only be assigned to pull requests, and are intended to help
reviewers navigate the outstanding pull requests to identify where to spend
their review time:

|                                      | Label name              | Description |
| ------------------------------------ | ----------------------- | ----------- |
| [:mag_right:][review:ready]          | `review:ready`          | Pull Requests that are ready to be reviewed by the maintainers |
| [:mag_right:][review:time-sensitive] | `review:time-sensitive` | Pull Requests that require review in a more timely manner      |

# TODO: correct all these URLs

[area:accessibility]: https://github.com/desktop/desktop/labels/integrations
[area:diffs]: https://github.com/desktop/desktop/labels/diffs
[area:docs]: https://github.com/desktop/desktop/labels/docs
[area:dependencies]: https://github.com/desktop/desktop/labels/docs
[area:electron]: https://github.com/desktop/desktop/labels/electron
[area:enhancements]: https://github.com/desktop/desktop/labels/enhancement
[area:external-websites]: https://github.com/desktop/desktop/labels/website
[area:integrations]: https://github.com/desktop/desktop/labels/integrations
[area:metrics]: https://github.com/desktop/desktop/labels/enhancement
[area:performance]: https://github.com/desktop/desktop/labels/performance
[area:tech-debt]: https://github.com/desktop/desktop/labels/tech-debt
[area:themes]: https://github.com/desktop/desktop/labels/themes
[area:tooling]: https://github.com/desktop/desktop/labels/infrastructure

[good first issue]: https://github.com/desktop/desktop/labels/good%20first%20issue
[help wanted]: https://github.com/desktop/desktop/labels/help%20wanted

[platform:windows]: https://github.com/desktop/desktop/labels/windows
[platform:linux]: https://github.com/desktop/desktop/labels/linux
[platform:macOS]: https://github.com/desktop/desktop/labels/macOS

[collaboration:user-research]: https://github.com/desktop/desktop/labels/user-research
[collaboration:needs-design-input]: https://github.com/desktop/desktop/labels/needs-design-input

[triage:more-information-needed]: https://github.com/desktop/desktop/labels/more-information-needed
[triage:potential-bug]: https://github.com/desktop/desktop/labels/status%3Aconfirmed-bug
[triage:confirmed-bug]: https://github.com/desktop/desktop/labels/status%3Aconfirmed-bug
[triage:not-a-bug]: https://github.com/desktop/desktop/labels/status%3Aconfirmed-bug

[impact:priority-1]: https://github.com/desktop/desktop/labels/priority-1
[impact:priority-2]: https://github.com/desktop/desktop/labels/priority-2
[impact:priority-3]: https://github.com/desktop/desktop/labels/priority-3

[support]: https://github.com/desktop/desktop/labels/support

[review:ready]: https://github.com/desktop/desktop/labels/ready-for-review
[review:time-sensitive]: https://github.com/desktop/desktop/labels/time-sensitive
