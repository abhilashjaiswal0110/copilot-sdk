# Use Cases & Prompts

Real-world patterns and prompt templates for building production applications with the GitHub Copilot SDK.

## Available Use Cases

| Use Case | Description | Key Skills |
|----------|-------------|------------|
| [Code Review Agent](./code-review-agent.md) | Automated PR and code review with inline feedback | Tool use, streaming, multi-turn |
| [Customer Support Bot](./customer-support-agent.md) | Context-aware support assistant with knowledge base | Session persistence, custom tools |
| [DevOps Automation Agent](./devops-automation-agent.md) | Infrastructure queries, incident response, and runbooks | MCP integration, structured output |
| [Data Analysis Agent](./data-analyst-agent.md) | Analyze datasets, generate reports, and answer data questions | Custom tools, long sessions |

---

## Prompt Engineering Tips

### Be Specific About Output Format

Copilot follows formatting instructions reliably. Specify format explicitly when you need structured output:

```
Analyze the code changes below and return your review as JSON with keys:
- summary (string): one-sentence overview
- issues (array): each with { severity, file, line, message }
- approved (boolean): whether the PR can be merged
```

### Use System Messages for Persona

System messages set the tone and scope of the agent. Keep them focused:

```typescript
const session = await client.createSession({
    systemMessage: {
        content: `You are a senior software engineer reviewing pull requests.
Focus on: security vulnerabilities, performance bottlenecks, and adherence to SOLID principles.
Be concise. Use bullet points. Do not re-explain the code unless it is unclear.`,
    },
});
```

### Chain Tools for Multi-Step Tasks

Define multiple tools and let Copilot orchestrate them in sequence:

```typescript
const tools = [
    fetchPullRequest,    // Get PR diff
    lookupJiraTicket,    // Get related issue context
    postReviewComment,   // Post inline comments
];
```

### Use Temperature Guidance in Prompts

For deterministic output (e.g., structured data), ask for precision:

```
Return ONLY valid JSON. No markdown, no explanation, no wrapping.
```

For creative tasks, encourage exploration:

```
Think through several approaches before recommending one. Show your reasoning.
```

---

## Common Prompt Templates

### Code Review

```
Review the following code change. Focus on:
1. Security issues (injection, auth, data exposure)
2. Logic errors or edge cases
3. Performance concerns
4. Code style and readability

Code:
{CODE_DIFF}

Return feedback as a structured list grouped by severity: Critical, Major, Minor.
```

### Incident Analysis

```
You are an on-call SRE. Analyze the following logs and identify:
1. Root cause of the incident
2. Affected services and dependencies
3. Recommended immediate actions
4. Prevention measures

Logs:
{LOG_OUTPUT}
```

### Data Summary

```
Analyze the following dataset and provide:
- Key statistics (min, max, mean, median)
- Notable trends or anomalies
- Top 3 actionable insights
- Suggested visualizations

Data:
{DATA_CSV_OR_JSON}
```

### Documentation Generation

```
Generate comprehensive API documentation for the following function.
Include: description, parameters with types and constraints, return value, error conditions, and one usage example.

Function:
{FUNCTION_CODE}
```

---

## Related Resources

- [Getting Started Tutorial](../getting-started.md)
- [Local Development Setup](../local-development.md)
- [Authentication Guide](../auth/index.md)
- [Agent Skills Reference](../../agents/README.md)
