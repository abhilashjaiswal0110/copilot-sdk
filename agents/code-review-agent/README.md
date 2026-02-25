# Code Review Agent

An automated code review agent that analyzes pull request diffs for security vulnerabilities, logic errors, performance issues, and code quality.

## Quick Start

```bash
# Node.js
npx tsx examples/nodejs.ts

# Python
uv run python examples/python.py
```

## What This Agent Does

- Fetches and analyzes PR diffs
- Identifies security vulnerabilities (OWASP Top 10)
- Flags logic errors and edge cases
- Spots performance anti-patterns
- Checks code clarity and maintainability
- Returns structured review output with file, line, severity, and suggestion

## Tools Required

| Tool | Description |
|------|-------------|
| `fetch_diff` | Retrieve a PR diff from GitHub |
| `post_review_comment` | Post inline review comments (optional) |

## Configuration

Set these environment variables before running:

```bash
COPILOT_GITHUB_TOKEN=<your-token>   # or GH_TOKEN
GITHUB_TOKEN=<your-pat>              # for GitHub API calls (fetch_diff)
```

## Prompt Reference

See [agent.md](./agent.md) for the full system prompt and tool definitions.

## Full Documentation

See [Use Case: Code Review Agent](../../docs/use-cases/code-review-agent.md) for detailed documentation, prompt variations, and GitHub Actions integration.
