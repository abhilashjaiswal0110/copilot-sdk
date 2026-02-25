# Agent Skills

Production-ready agent skill templates for the GitHub Copilot SDK. Each agent provides a focused capability that you can embed directly in your application.

## Available Agents

| Agent | Description | Use Case Guide |
|-------|-------------|----------------|
| [Code Review Agent](./code-review-agent/) | Automated PR and code quality analysis | [Use Case](../docs/use-cases/code-review-agent.md) |
| [Customer Support Agent](./customer-support-agent/) | Context-aware support with knowledge base | [Use Case](../docs/use-cases/customer-support-agent.md) |
| [DevOps Agent](./devops-agent/) | Infrastructure queries and incident response | [Use Case](../docs/use-cases/devops-automation-agent.md) |
| [Data Analyst Agent](./data-analyst-agent/) | Conversational data analysis and reporting | [Use Case](../docs/use-cases/data-analyst-agent.md) |

---

## Structure

Each agent follows a consistent structure:

```
agents/<agent-name>/
  README.md         # Agent overview, setup, and prompt reference
  agent.md          # Copilot agent skill definition (system prompt + tool catalog)
  examples/         # Usage examples in multiple languages
    nodejs.ts
    python.py
```

---

## How to Use an Agent Skill

### Option 1: Use the Agent Skill File Directly

Each `agent.md` file contains a Copilot agent skill definition compatible with the SDK's `customAgents` option:

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
const session = await client.createSession({
    customAgents: [{
        name: "code-reviewer",
        displayName: "Code Reviewer",
        description: "Reviews code changes for security, performance, and quality",
        prompt: `<paste system prompt from agent.md>`,
    }],
    tools: [/* tools from the agent's tool catalog */],
});
```

### Option 2: Run the Example Directly

Each agent includes ready-to-run examples:

```bash
# Node.js
cd agents/code-review-agent
npx tsx examples/nodejs.ts

# Python
cd agents/code-review-agent
uv run python examples/python.py
```

---

## Creating a Custom Agent

Use an existing agent as a starting point:

1. Copy an existing agent directory: `cp -r agents/code-review-agent agents/my-agent`
2. Update `README.md` with your agent's purpose
3. Edit `agent.md` to customize the system prompt and tool catalog
4. Implement your tools in `examples/`

For more detail on building custom agents and tools, see:
- [Getting Started Tutorial](../docs/getting-started.md#create-custom-agents)
- [SDK Tool Documentation](../nodejs/README.md)
- [Use Cases & Prompts](../docs/use-cases/README.md)
