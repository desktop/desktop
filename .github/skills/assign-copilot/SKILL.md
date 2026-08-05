---
name: assign-copilot
description: Assigns a GitHub issue to the Copilot coding agent, optionally specifying a custom agent. Use this when asked to assign an issue to Copilot or delegate an issue to CCA.
---

# Assign Issue to Copilot Coding Agent

Use the `assign.sh` script in this skill's directory to assign a GitHub issue to the Copilot coding agent (CCA).

## Usage

Run the script with the following arguments:

```bash
bash <skill-directory>/assign.sh <issue-number> [custom-agent-name]
```

- `issue-number` (required): The GitHub issue number to assign.
- `custom-agent-name` (optional): The name of a custom agent to use (e.g., `deskocat`, `electron-upgrader`).

## Examples

Assign issue #42 to Copilot with the default agent:

```bash
bash <skill-directory>/assign.sh 42
```

Assign issue #42 to Copilot with a specific custom agent:

```bash
bash <skill-directory>/assign.sh 42 deskocat
```

## Available Custom Agents

Before assigning, you can check which custom agents are available by looking at `.github/agents/` in the repository. Each `.agent.md` file defines a custom agent.

## Requirements

- The `gh` CLI must be installed and authenticated.
- The current directory must be inside a GitHub repository.
- Copilot coding agent must be enabled for the repository.

## Behavior

1. The script detects the repository owner and name from the current git remote.
2. It assigns the issue to `@copilot` using the GitHub CLI.
3. If a custom agent is specified, it uses the REST API to set the `agent_assignment` field.
4. It prints a link to the issue so you can follow progress.
