# DevOps Agent

An SRE and DevOps assistant for infrastructure health queries, incident response, runbook execution, and deployment analysis.

## Quick Start

```bash
# Node.js (requires kubectl in PATH for live cluster queries)
npx tsx examples/nodejs.ts

# Python
uv run python examples/python.py
```

## What This Agent Does

- Runs read-only kubectl commands to check cluster health
- Fetches application logs and metrics
- Queries recent deployments and releases via GitHub MCP
- Walks through incident response runbooks step-by-step
- Generates post-mortem reports from logs and timelines

## Tools Required

| Tool | Description |
|------|-------------|
| `run_kubectl` | Execute read-only kubectl commands (get, describe, logs, top) |
| `fetch_logs` | Retrieve application logs for a service |
| `list_recent_deployments` | Query recent deployment history |

## Optional: GitHub MCP Integration

Connect the GitHub MCP server to correlate incidents with recent code changes:

```typescript
const session = await client.createSession({
    mcpServers: {
        github: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
    },
    tools: [runKubectl, fetchLogs],
});
```

## Configuration

```bash
COPILOT_GITHUB_TOKEN=<your-token>
KUBECONFIG=<path-to-kubeconfig>   # Optional, defaults to ~/.kube/config
```

## Safety

By default, this agent only allows read-only kubectl commands (`get`, `describe`, `logs`, `top`, `rollout status`). Write operations require explicit user confirmation.

## Full Documentation

See [Use Case: DevOps Automation Agent](../../docs/use-cases/devops-automation-agent.md).
