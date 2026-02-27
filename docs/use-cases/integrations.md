# Integration Use Cases

Production integration patterns for the GitHub Copilot SDK — connecting agents to real-world triggers, webhooks, and pipelines.

## Use Cases

| Use Case | Agent | Trigger |
|----------|-------|---------|
| [Automated PR Review Bot](#automated-pr-review-bot) | Code Review | GitHub Actions |
| [Customer Support Tier-1 Automation](#customer-support-tier-1-automation) | Customer Support | Zendesk webhook |
| [Conversational BI](#conversational-bi) | Data Analyst | Slack bot |
| [SRE Incident Assistant](#sre-incident-assistant) | DevOps | PagerDuty alert |
| [CI/CD Security Gate](#cicd-security-gate) | Code Review | Pipeline step |

---

## Automated PR Review Bot

**Trigger:** GitHub Actions on `pull_request` event  
**Agent:** [Code Review Agent](../../agents/code-review-agent/)  
**Outcome:** Inline review comments posted directly to the PR

### How It Works

A GitHub Actions workflow starts the code-review agent when a PR is opened or updated. The agent fetches the diff, analyses it for security issues, logic errors, and anti-patterns, then posts structured inline comments via the GitHub API.

```yaml
# .github/workflows/pr-review.yml
name: "AI Code Review"

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install SDK
        run: pip install github-copilot-sdk httpx

      - name: Run code review agent
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
          REVIEW_OWNER: ${{ github.repository_owner }}
          REVIEW_REPO: ${{ github.event.repository.name }}
          REVIEW_PR_NUMBER: ${{ github.event.pull_request.number }}
        run: python agents/code-review-agent/examples/python.py
```

### Security Gate Variant

To **block merges** when critical findings are found, exit with a non-zero code:

```python
result = await session.send_and_wait({"prompt": "..."})
findings = json.loads(result)
if any(f["severity"] == "critical" for f in findings.get("findings", [])):
    sys.exit(1)  # Fails the CI check
```

---

## Customer Support Tier-1 Automation

**Trigger:** Zendesk webhook (new ticket event)  
**Agent:** [Customer Support Agent](../../agents/customer-support-agent/)  
**Outcome:** Automated first response with KB lookup and ticket creation

### How It Works

A lightweight webhook receiver accepts incoming Zendesk ticket events, invokes the customer-support agent with the ticket body, and posts the agent's response back as a public reply using the Zendesk API.

```python
# webhook_server.py (Flask / FastAPI)
from fastapi import FastAPI, Request
from copilot import CopilotClient

app = FastAPI()
copilot = CopilotClient()

@app.on_event("startup")
async def startup():
    await copilot.start()

@app.post("/webhooks/zendesk")
async def handle_zendesk(request: Request):
    payload = await request.json()
    ticket_body = payload["ticket"]["description"]
    customer_email = payload["ticket"]["requester"]["email"]

    session = await copilot.create_session({
        "model": "gpt-4.1",
        "system_message": {"content": SUPPORT_SYSTEM_PROMPT},
        "tools": [search_knowledge_base, lookup_account, create_ticket],
    })

    response = await session.send_and_wait({"prompt": ticket_body})

    # Post response back to Zendesk ticket
    await post_zendesk_reply(payload["ticket"]["id"], response, customer_email)
    return {"status": "replied"}
```

### Key Considerations

- Use a **dedicated session per ticket** to keep conversation context isolated.
- Store `session_id` in the Zendesk ticket metadata for follow-up messages.
- Set a short `timeout` on the agent invocation to stay within Zendesk's webhook timeout window.

---

## Conversational BI

**Trigger:** Slack slash command (`/query <question>`)  
**Agent:** [Data Analyst Agent](../../agents/data-analyst-agent/)  
**Outcome:** Natural-language answers to data questions, with optional chart generation

### How It Works

A Slack app receives slash commands and routes them to the data-analyst agent. The agent translates the natural-language query to SQL (via the `run_sql_query` tool), executes against the configured database, and returns a formatted summary back to the Slack channel.

```python
# slack_bot.py (Slack Bolt)
from slack_bolt.async_app import AsyncApp
from copilot import CopilotClient

slack = AsyncApp(token=os.environ["SLACK_BOT_TOKEN"])
copilot = CopilotClient()

@slack.command("/query")
async def handle_query(ack, body, say):
    await ack()
    question = body["text"]
    user = body["user_id"]

    session = await copilot.create_session({
        "model": "gpt-4.1",
        "system_message": {"content": DATA_ANALYST_SYSTEM_PROMPT},
        "tools": [run_sql_query, compute_stats, load_csv],
    })

    result = await session.send_and_wait({"prompt": question})
    await say(f"<@{user}> Here's what I found:\n{result}")
```

### Persistent Sessions for Follow-Up Questions

To support follow-up questions in a thread, persist the session by Slack thread timestamp:

```python
sessions: dict[str, Session] = {}  # keyed by thread_ts

@slack.event("app_mention")
async def handle_mention(event, say):
    thread_ts = event.get("thread_ts", event["ts"])
    if thread_ts not in sessions:
        sessions[thread_ts] = await copilot.create_session({...})
    session = sessions[thread_ts]
    result = await session.send_and_wait({"prompt": event["text"]})
    await say(result, thread_ts=thread_ts)
```

---

## SRE Incident Assistant

**Trigger:** PagerDuty webhook (`incident.triggered` event)  
**Agent:** [DevOps Agent](../../agents/devops-agent/)  
**Outcome:** Immediate cluster snapshot posted to the incident Slack channel

### How It Works

When PagerDuty fires an alert, a webhook handler invokes the devops agent with the alert context. The agent runs a series of read-only kubectl commands to capture the cluster state (pod health, recent deployments, error logs) and posts a structured snapshot to the incident channel.

```python
# pagerduty_handler.py
from fastapi import FastAPI, Request
from copilot import CopilotClient

app = FastAPI()
copilot = CopilotClient()

@app.post("/webhooks/pagerduty")
async def handle_alert(request: Request):
    payload = await request.json()
    alert = payload["messages"][0]["event"]
    service_name = alert["data"]["service"]["name"]
    alert_title = alert["data"]["incident"]["title"]

    session = await copilot.create_session({
        "model": "gpt-4.1",
        "system_message": {"content": SRE_SYSTEM_PROMPT},
        "tools": [run_kubectl, fetch_logs, list_recent_deployments],
    })

    prompt = (
        f"🚨 PagerDuty Alert: {alert_title}\n"
        f"Service: {service_name}\n"
        f"Run a full health check and return a cluster snapshot. "
        f"Check pod status, recent deployments, and error logs."
    )

    snapshot = await session.send_and_wait({"prompt": prompt})

    # Post to Slack incident channel
    await post_to_slack(channel="#incidents", text=snapshot)
    return {"status": "snapshot_posted"}
```

### Runbook Integration

For recurring incident types, include a runbook reference in the system prompt:

```python
system_message = f"""
You are a senior SRE assistant.
For alerts named '{alert_title}', follow runbook: {RUNBOOK_URL}
Run only read-only kubectl commands. Summarize findings in < 500 words.
"""
```

---

## CI/CD Security Gate

**Trigger:** CI/CD pipeline step (GitHub Actions, Jenkins, GitLab CI)  
**Agent:** [Code Review Agent](../../agents/code-review-agent/)  
**Outcome:** Pipeline fails if critical security vulnerabilities are detected

### How It Works

The code-review agent is invoked as a pipeline step. It fetches the PR diff, scans for security vulnerabilities (injection flaws, exposed secrets, insecure configurations), and exits with code `1` to block the merge if critical issues are found.

```python
# security_gate.py
import asyncio
import json
import sys

from copilot import CopilotClient
from agents.code_review_agent.examples.python import fetch_diff, post_review_comment

SECURITY_SYSTEM_PROMPT = """
You are a security-focused code reviewer.
Focus exclusively on: injection vulnerabilities, exposed secrets, insecure dependencies,
broken authentication, and OWASP Top-10 issues.
Return ONLY valid JSON: { "approved": bool, "findings": [{ "severity", "file", "line", "message" }] }
"""

async def run_security_gate(owner: str, repo: str, pr_number: int) -> None:
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "system_message": {"content": SECURITY_SYSTEM_PROMPT},
        "tools": [fetch_diff, post_review_comment],
    })

    result_parts = []
    session.on(lambda e: result_parts.append(
        e.data.delta_content
        if hasattr(e.data, "delta_content") else ""
    ))

    await session.send_and_wait({
        "prompt": f"Security-scan PR #{pr_number} in {owner}/{repo}. Return JSON only."
    })

    await client.stop()

    try:
        review = json.loads("".join(result_parts))
    except json.JSONDecodeError:
        print("⚠️  Could not parse agent output as JSON — passing gate.")
        sys.exit(0)

    critical = [f for f in review.get("findings", []) if f.get("severity") == "critical"]
    if critical:
        print(f"🚫 Security gate FAILED: {len(critical)} critical finding(s)")
        for finding in critical:
            print(f"   [{finding['file']}:{finding['line']}] {finding['message']}")
        sys.exit(1)

    print("✅ Security gate PASSED")
    sys.exit(0)


if __name__ == "__main__":
    import os
    asyncio.run(run_security_gate(
        owner=os.environ["REVIEW_OWNER"],
        repo=os.environ["REVIEW_REPO"],
        pr_number=int(os.environ["REVIEW_PR_NUMBER"]),
    ))
```

### GitHub Actions Integration

```yaml
# .github/workflows/security-gate.yml
name: "Security Gate"

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install github-copilot-sdk httpx

      - name: Run security gate
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
          REVIEW_OWNER: ${{ github.repository_owner }}
          REVIEW_REPO: ${{ github.event.repository.name }}
          REVIEW_PR_NUMBER: ${{ github.event.pull_request.number }}
        run: python security_gate.py
```

---

## Related Resources

- [Code Review Agent](../../agents/code-review-agent/)
- [Customer Support Agent](../../agents/customer-support-agent/)
- [Data Analyst Agent](../../agents/data-analyst-agent/)
- [DevOps Agent](../../agents/devops-agent/)
- [Getting Started Guide](../getting-started.md)
- [Authentication](../auth/index.md)
