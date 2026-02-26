# Customer Support Agent

A context-aware customer support assistant that uses your knowledge base, CRM, and ticketing system to resolve customer issues conversationally.

## Quick Start

```bash
# Node.js
npx tsx examples/nodejs.ts

# Python
uv run python examples/python.py
```

## What This Agent Does

- Searches a knowledge base for answers to customer questions
- Looks up account information by email
- Creates support tickets for unresolved issues
- Maintains conversation context across multiple turns
- Escalates to human agents when appropriate

## Tools Required

| Tool | Description |
|------|-------------|
| `search_knowledge_base` | Full-text search over product documentation/FAQs |
| `lookup_account` | Retrieve customer account details by email |
| `create_ticket` | Create a support ticket in your ticketing system |
| `escalate_to_human` | Trigger escalation to a human support agent |

## Configuration

```bash
COPILOT_GITHUB_TOKEN=<your-token>
KB_API_URL=<your-knowledge-base-api>
CRM_API_URL=<your-crm-api>
TICKETING_API_URL=<your-ticketing-api>
```

## Customization

Edit `agent.md` to:
- Update the company name and product names
- Adjust the tone and response style
- Add domain-specific tool definitions
- Modify escalation thresholds

## Full Documentation

See [Use Case: Customer Support Agent](../../docs/use-cases/customer-support-agent.md) for detailed documentation, multi-turn patterns, and escalation logic.
