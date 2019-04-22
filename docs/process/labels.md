# Issue and Pull Request Labels

This section outlines the labels currently used in the project, and adds context
about what each label represents.

## Common labels

These labels are used for both issues and pull requests, and are assigned to
help understand the type of work involved.

|                               | Label name       | Description |
| ----------------------------- | -----------------| ----------- |
| [:mag_right:][docs]           | `docs`           | Issues and pull requests related to documentation work on the project |
| [:mag_right:][infrastructure] | `infrastructure` | Issues and pull requests related to scripts and tooling for GitHub Desktop |
| [:mag_right:][tech-debt]      | `tech-debt`      | Issues and pull requests related to addressing technical debt or improving the codebase |

## Issue-specific labels

This section is organized into sub-groups, as groups of labels relate to
specific work being done in the issue tracker.

### Issue triage

The triage process is how the maintainers process incoming issues and prioritize
the work required to address the feedback raised. These labels help us to track
the flow of an issue through this process

|                                        | Label name                  | Description |
| -------------------------------------- | ----------------------------| ----------- |
| [:mag_right:][bug]                     | `bug`                     | Confirmed bugs or reports that are very likely to be bugs |
| [:mag_right:][enhancement]             | `enhancement`             | Issues that propose to improve the app and solve a problem for users |
| [:mag_right:][investigation-needed]    | `investigation-needed`    | Likely bugs, but haven't been reliably reproduced by a reviewer |
| [:mag_right:][more-information-needed] | `more-information-needed` | The submitter needs to provide more information about the issue |
| [:mag_right:][priority-1]              | `priority-1`              | Major bug affecting large population and inhibiting their work |
| [:mag_right:][priority-2]              | `priority-2`              | Bug that affects more than a few users in a meaningful way but doesn't prevent core functions |
| [:mag_right:][priority-3]              | `priority-3`              | Bugs that affect small number of users and/or relatively cosmetic in nature |
| [:mag_right:][support]                 | `support`                 | Issues specific to an individual users' configuration requiring diagnosis and clarification to resolve |

### External contributions

We use these labels to identify work that is ideal for external contributors to
get involved with.

|                                 | Label name         |  Description |
| ------------------------------- | ------------------ |  ----------- |
| [:mag_right:][good first issue] | `good first issue` | Issues marked as ideal for a brand new contributor to start with |
| [:mag_right:][help wanted]      | `help wanted`      | Issues marked as ideal for external contributors |

### Planning

We use these labels to track tasks outside the usual flow of addressing bugs or
implementing features:

|                                   | Label name           |  Description |
| --------------------------------- | -------------------- |  ----------- |
| [:mag_right:][meta]               | `meta`               | Issues used to co-ordinate tasks or discuss a feature before the required work is captured |
| [:mag_right:][user-research]      | `user-research`      | Issues that may benefit from user interviews, validations, and/or usability testing |
| [:mag_right:][needs-design-input] | `needs-design-input` | Issues that require design input from the core team before the work can be started |

### Workflows

As we work on new parts of the application, or refining existing workflows, we use
these labels to track issues that arise as part of the development process.

These labels should be cleaned up when contributors switch focus to different areas,
so that they don't become overused and add noise.

|                                  | Label name         |  Description |
| -------------------------------- | ------------------ |  ----------- |
| [:mag_right:][workflow:rebase]   | `workflow:rebase`  | Supporting rebase flows in the app |
| [:mag_right:][workflow:stashing] | `workflow:stashing`| Supporting stashing uncommitted changes in the app |

### Specialized areas

We use these labels to identify issues related to a specific area or the app,
or a specific subset of users:

|                             | Label name     | Description |
| --------------------------- | -------------- | ----------- |
| [:mag_right:][codemirror]   | `codemirror`   | Issues related to our use of [CodeMirror](https://codemirror.net/) that may require upstream fixes |
| [:mag_right:][electron]     | `electron`     | Issues related to our use of [Electron](https://electronjs.org) that may need updates to Electron or upstream fixes |
| [:mag_right:][integrations] | `integrations` | Issues related to editor and shell integrations that ship in Desktop |
| [:mag_right:][performance]  | `performance`  | Relating to things affecting performance |
| [:mag_right:][themes]       | `themes`       | Issues related the light or dark themes that ship in Desktop |
| [:mag_right:][website]      | `website`      | Issues that relate to external websites and require co-ordination to resolve |

### Environments

Sometimes issues are isolated to a specific operating system. We use these
labels to help identify these issues, so maintainers with that setup - or
experience with that setup - can easily find them in the issue tracker.

|                        | Label name | Description |
| ---------------------- | ---------- | ----------- |
| [:mag_right:][linux]   | `linux`    | Issues specific to Desktop usage on Linux |
| [:mag_right:][macOS]   | `macOS`    | Issues specific to Desktop usage on macOS |
| [:mag_right:][windows] | `windows`  | Issues specific Desktop usage on Windows |


## Pull Request-specific labels

These labels should only be assigned to pull requests, and are intended to help
reviewers navigate the open contributions to identify how best to spend their
time:

|                                 | Label name         | Description |
| ------------------------------- | ------------------ | ----------- |
| [:mag_right:][ready-for-review] | `ready-for-review` | Pull Requests that are ready to be reviewed by the maintainers |
| [:mag_right:][time-sensitive]   | `time-sensitive`   | Pull Requests that require review in a more timely manner      |


[bug]: https://github.com/desktop/desktop/labels/bug
[codemirror]: https://github.com/desktop/desktop/labels/codemirror
[docs]: https://github.com/desktop/desktop/labels/docs
[electron]: https://github.com/desktop/desktop/labels/electron
[enhancement]: https://github.com/desktop/desktop/labels/enhancement
[good first issue]: https://github.com/desktop/desktop/labels/good%20first%20issue
[help wanted]: https://github.com/desktop/desktop/labels/help%20wanted
[infrastructure]: https://github.com/desktop/desktop/labels/infrastructure
[integrations]: https://github.com/desktop/desktop/labels/integrations
[investigation-needed]: https://github.com/desktop/desktop/labels/investigation-needed
[linux]: https://github.com/desktop/desktop/labels/linux
[macOS]: https://github.com/desktop/desktop/labels/macOS
[meta]: https://github.com/desktop/desktop/labels/meta
[more-information-needed]: https://github.com/desktop/desktop/labels/more-information-needed
[needs-design-input]: https://github.com/desktop/desktop/labels/needs-design-input
[performance]: https://github.com/desktop/desktop/labels/performance
[priority-1]: https://github.com/desktop/desktop/labels/priority-1
[priority-2]: https://github.com/desktop/desktop/labels/priority-2
[priority-3]: https://github.com/desktop/desktop/labels/priority-3
[ready-for-review]: https://github.com/desktop/desktop/labels/ready-for-review
[support]: https://github.com/desktop/desktop/labels/support
[tech-debt]: https://github.com/desktop/desktop/labels/tech-debt
[themes]: https://github.com/desktop/desktop/labels/themes
[time-sensitive]: https://github.com/desktop/desktop/labels/time-sensitive
[user-research]: https://github.com/desktop/desktop/labels/user-research
[website]: https://github.com/desktop/desktop/labels/website
[windows]: https://github.com/desktop/desktop/labels/windows
