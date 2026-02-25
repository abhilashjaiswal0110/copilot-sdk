# Use Case: DevOps Automation Agent

Automate infrastructure queries, incident response, deployment summaries, and runbook execution using the GitHub Copilot SDK with MCP integration.

## Overview

A DevOps automation agent can:
- Query infrastructure state (Kubernetes, cloud providers)
- Walk through incident response runbooks step-by-step
- Summarize recent deployments and changes
- Generate postmortem reports from logs
- Assist with on-call tasks through natural language

---

## Architecture

```
Engineer / Alert Trigger
          ↓
    DevOps Agent
          ↓ (Tool calls + MCP)
┌─────────┴─────────┐
│ run_kubectl        │  query_metrics  │  fetch_logs  │
│ github MCP server  │  post_to_slack  │  list_deploys│
└───────────────────────────────────────────────────────┘
          ↓
  Structured Response / Automated Action
```

---

## Prompt Templates

### System Message

```
You are a senior DevOps engineer and SRE assistant.

Your capabilities:
- Query Kubernetes cluster state using kubectl commands
- Fetch application logs and metrics
- Look up recent deployments and releases
- Post updates to Slack channels
- Walk through incident response runbooks

Guidelines:
- Always verify the environment (prod/staging/dev) before running commands
- Prefer read-only operations unless the engineer explicitly asks for changes
- When executing runbook steps, confirm each step before proceeding
- Summarize actions taken at the end of each interaction
- Flag any anomalies or risks proactively

Environment context: {ENV_CONTEXT}
```

### Incident Response Prompt

```
🚨 Incident Alert: {ALERT_NAME}

Alert details:
{ALERT_DETAILS}

Walk me through incident response. Start by:
1. Checking the health of affected services
2. Reviewing recent deployments in the last 2 hours
3. Fetching relevant error logs
4. Summarizing potential root causes

Do not make any changes without my approval.
```

### Post-Mortem Generation

```
Generate a post-mortem report for the following incident.

Incident timeline:
{TIMELINE}

Affected services:
{SERVICES}

Root cause analysis:
{RCA}

Format the report with these sections:
- Executive Summary
- Impact (duration, affected users, revenue impact estimate)
- Timeline of Events
- Root Cause
- Immediate Actions Taken
- Follow-up Action Items (with owners and due dates)
- What Went Well / What Could Be Improved
```

### Deployment Summary

```
Summarize the last 24 hours of deployments.

Include:
- Services deployed and versions
- Any rollbacks or failed deployments
- Notable configuration changes
- Environment health status post-deploy

Focus on: production environment
```

---

## Implementation Examples

<details open>
<summary><strong>Node.js / TypeScript with MCP</strong></summary>

```typescript
import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Tool: run a read-only kubectl command
const runKubectl = defineTool("run_kubectl", {
    description: "Run a read-only kubectl command to inspect cluster state",
    parameters: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The kubectl command arguments (e.g. 'get pods -n production')",
            },
        },
        required: ["command"],
    },
    handler: async ({ command }) => {
        // Only allow read-only commands for safety
        const allowed = ["get", "describe", "logs", "top", "rollout status"];
        const isReadOnly = allowed.some((cmd) => command.trimStart().startsWith(cmd));
        if (!isReadOnly) {
            return { error: "Only read-only kubectl commands are permitted" };
        }
        try {
            const { stdout, stderr } = await execAsync(`kubectl ${command}`);
            return { output: stdout, stderr };
        } catch (err: unknown) {
            return { error: String(err) };
        }
    },
});

const fetchLogs = defineTool("fetch_logs", {
    description: "Fetch recent logs for a service",
    parameters: {
        type: "object",
        properties: {
            service: { type: "string" },
            namespace: { type: "string", default: "production" },
            lines: { type: "number", default: 100 },
        },
        required: ["service"],
    },
    handler: async ({ service, namespace, lines }) => {
        const { stdout } = await execAsync(
            `kubectl logs -l app=${service} -n ${namespace} --tail=${lines} --since=1h`
        );
        return { logs: stdout };
    },
});

const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    streaming: true,
    systemMessage: {
        content: `You are a senior SRE assistant. 
Help with incident response, deployment queries, and infrastructure health checks.
Only use read-only kubectl commands unless explicitly authorized.`,
    },
    tools: [runKubectl, fetchLogs],
    // Optionally connect GitHub MCP for PR/release context
    mcpServers: {
        github: {
            type: "http",
            url: "https://api.githubcopilot.com/mcp/",
        },
    },
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});

await session.sendAndWait({
    prompt: "Check the health of the api-gateway service in production. Any recent errors?",
});

await client.stop();
process.exit(0);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import asyncio
import subprocess
import sys
from copilot import CopilotClient
from copilot.tools import define_tool
from copilot.generated.session_events import SessionEventType
from pydantic import BaseModel, Field

ALLOWED_PREFIXES = ("get", "describe", "logs", "top", "rollout")

class KubectlParams(BaseModel):
    command: str = Field(description="kubectl arguments, e.g. 'get pods -n production'")

class FetchLogsParams(BaseModel):
    service: str
    namespace: str = "production"
    lines: int = 100

@define_tool(description="Run a read-only kubectl command")
async def run_kubectl(params: KubectlParams) -> dict:
    cmd = params.command.strip()
    if not any(cmd.startswith(p) for p in ALLOWED_PREFIXES):
        return {"error": "Only read-only kubectl commands are permitted"}
    result = subprocess.run(["kubectl"] + cmd.split(), capture_output=True, text=True)
    return {"output": result.stdout, "stderr": result.stderr}

@define_tool(description="Fetch recent logs for a service")
async def fetch_logs(params: FetchLogsParams) -> dict:
    result = subprocess.run(
        ["kubectl", "logs", "-l", f"app={params.service}", 
         "-n", params.namespace, f"--tail={params.lines}", "--since=1h"],
        capture_output=True, text=True
    )
    return {"logs": result.stdout}

async def main():
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "streaming": True,
        "system_message": {
            "content": "You are a senior SRE assistant. Help with incident response and infrastructure health checks."
        },
        "tools": [run_kubectl, fetch_logs],
    })

    def handle_event(event):
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()

    session.on(handle_event)

    await session.send_and_wait({
        "prompt": "Check the health of the api-gateway in production. Any recent errors?"
    })
    print()
    await client.stop()

asyncio.run(main())
```

</details>

---

## MCP Integration for GitHub Context

Connect the GitHub MCP server to give the agent access to repository events, releases, and PRs—valuable for correlating deployments with incidents:

```typescript
const session = await client.createSession({
    mcpServers: {
        github: {
            type: "http",
            url: "https://api.githubcopilot.com/mcp/",
        },
    },
});
```

This lets the agent:
- Look up recent merged PRs near incident time
- Check release notes for a deployed version
- Find the author of a problematic change

---

## Runbook Automation Pattern

Structure runbooks as a sequence of tool calls with human approval gates:

```typescript
await session.sendAndWait({
    prompt: `
Execute the high-memory runbook for service: ${service}

Steps:
1. Check current memory usage
2. Identify top memory-consuming pods
3. Check if this is above the 90th percentile for the last 7 days
4. WAIT FOR MY APPROVAL before taking any action

Report your findings after step 3.
`,
});
```

---

## Related Resources

- [Agent Skill: DevOps](../../agents/devops-agent/README.md)
- [MCP Documentation](../mcp/overview.md)
- [Code Review Agent](./code-review-agent.md)
- [Data Analysis Agent](./data-analyst-agent.md)
