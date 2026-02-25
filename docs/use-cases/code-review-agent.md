# Use Case: Code Review Agent

Automate pull request reviews with inline feedback, security scanning, and quality checks using the GitHub Copilot SDK.

## Overview

A code review agent can:
- Analyze diffs and suggest improvements
- Flag security vulnerabilities and anti-patterns
- Check adherence to coding standards
- Post structured review comments
- Summarize changes for reviewers

---

## Architecture

```
PR Webhook / CLI Trigger
         ↓
  Code Review Agent
         ↓ (Tool calls)
  ┌──────┴──────┐
  │ fetch_diff  │  get_style_guide  │  post_comment │
  └─────────────────────────────────────────────────┘
         ↓
  Structured Review Output
```

---

## Prompt Templates

### System Message

```
You are a senior software engineer conducting a thorough code review.

Your goals:
- Identify security vulnerabilities (SQL injection, XSS, insecure deserialization, secrets in code)
- Spot logic errors, race conditions, and edge cases
- Flag performance anti-patterns (N+1 queries, unbounded loops, unnecessary allocations)
- Check code clarity and maintainability
- Verify error handling is complete

Guidelines:
- Be constructive, not critical
- Provide specific line references
- Suggest concrete improvements, not just problems
- Group findings by: Critical, Major, Minor, Suggestion
- Approve if no Critical or Major issues exist
```

### Review Prompt

```
Review the following pull request diff.

Title: {PR_TITLE}
Description: {PR_DESCRIPTION}

Diff:
{CODE_DIFF}

Return your review as JSON:
{
  "summary": "<one sentence>",
  "approved": <true|false>,
  "findings": [
    {
      "severity": "Critical|Major|Minor|Suggestion",
      "file": "<filename>",
      "line": <line_number_or_null>,
      "message": "<feedback>",
      "suggestion": "<code_snippet_or_null>"
    }
  ]
}
```

---

## Implementation Examples

<details open>
<summary><strong>Node.js / TypeScript</strong></summary>

```typescript
import { CopilotClient, defineTool } from "@github/copilot-sdk";

// Tool: fetch the PR diff (replace with your actual GitHub API call)
const fetchDiff = defineTool("fetch_diff", {
    description: "Fetch the diff for a pull request",
    parameters: {
        type: "object",
        properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pr_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pr_number"],
    },
    handler: async ({ owner, repo, pr_number }) => {
        // Replace with actual GitHub API client
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${pr_number}`,
            { headers: { Accept: "application/vnd.github.v3.diff" } }
        );
        return { diff: await response.text() };
    },
});

const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    systemMessage: {
        content: `You are a senior software engineer conducting thorough code reviews.
Identify security issues, logic errors, and performance problems.
Return findings as structured JSON.`,
    },
    tools: [fetchDiff],
});

const review = await session.sendAndWait({
    prompt: `Review PR #42 in owner/repo. Fetch the diff and analyze it.`,
});

console.log(review?.data.content);
await client.stop();
process.exit(0);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import asyncio
import httpx
from copilot import CopilotClient
from copilot.tools import define_tool
from pydantic import BaseModel, Field

class FetchDiffParams(BaseModel):
    owner: str = Field(description="Repository owner")
    repo: str = Field(description="Repository name")
    pr_number: int = Field(description="Pull request number")

@define_tool(description="Fetch the diff for a pull request")
async def fetch_diff(params: FetchDiffParams) -> dict:
    async with httpx.AsyncClient() as http:
        response = await http.get(
            f"https://api.github.com/repos/{params.owner}/{params.repo}/pulls/{params.pr_number}",
            headers={"Accept": "application/vnd.github.v3.diff"},
        )
    return {"diff": response.text}

async def main():
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "system_message": {
            "content": (
                "You are a senior software engineer conducting thorough code reviews. "
                "Identify security issues, logic errors, and performance problems. "
                "Return findings as structured JSON."
            )
        },
        "tools": [fetch_diff],
    })

    review = await session.send_and_wait({
        "prompt": "Review PR #42 in owner/repo. Fetch the diff and analyze it."
    })
    print(review.data.content)
    await client.stop()

asyncio.run(main())
```

</details>

---

## Prompt Variations

### Security-Focused Review

```
Focus exclusively on security vulnerabilities.

Check for:
- Injection flaws (SQL, NoSQL, LDAP, OS command)
- Broken authentication (hardcoded secrets, weak tokens)
- Sensitive data exposure (PII in logs, unencrypted storage)
- Insecure direct object references
- Security misconfiguration

Diff:
{CODE_DIFF}

Return a CVSS-style severity score and remediation steps for each finding.
```

### Performance Review

```
Analyze this code change for performance regressions.

Look for:
- Database N+1 query patterns
- Missing indexes based on query patterns
- Unbounded memory growth
- Synchronous I/O in async contexts
- Unnecessary computation inside loops

Diff:
{CODE_DIFF}

Estimate the performance impact (High/Medium/Low) for each issue.
```

### Documentation Review

```
Check whether the code change is adequately documented.

Verify:
- Public APIs have docstrings/JSDoc/GoDoc comments
- Complex logic is explained with inline comments
- README is updated if behavior changes
- Breaking changes are called out in the commit message

Diff:
{CODE_DIFF}

List documentation gaps with suggested text.
```

---

## Integration with GitHub Actions

```yaml
# .github/workflows/copilot-review.yml
name: Copilot Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Copilot CLI
        run: # Follow https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli
      - name: Run code review agent
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: node agents/code-review-agent/run.js
```

---

## Related Resources

- [Agent Skill: Code Review](../../agents/code-review-agent/README.md)
- [Customer Support Agent](./customer-support-agent.md)
- [DevOps Automation Agent](./devops-automation-agent.md)
- [Prompt Templates Reference](./README.md#common-prompt-templates)
