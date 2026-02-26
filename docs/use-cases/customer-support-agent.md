# Use Case: Customer Support Agent

Build a context-aware customer support assistant that integrates with your knowledge base, ticketing system, and product documentation.

## Overview

A customer support agent can:
- Answer questions using product documentation and FAQs
- Look up order or account information via custom tools
- Escalate unresolved issues to human agents
- Maintain conversation context across a session
- Generate ticket summaries and suggested resolutions

---

## Architecture

```
User Message
     ↓
Support Agent (persistent session)
     ↓ (Tool calls)
┌────┴────┐
│ search_kb │  lookup_account │  create_ticket │  escalate │
└──────────────────────────────────────────────────────────┘
     ↓
Response to User
```

---

## Prompt Templates

### System Message

```
You are a friendly and knowledgeable customer support agent for Acme Corp.

Your capabilities:
- Search the knowledge base to answer product questions
- Look up account information and order status
- Create support tickets for unresolved issues
- Escalate complex problems to human agents

Guidelines:
- Always greet the user by name if their account is found
- Keep responses concise and actionable (under 3 paragraphs)
- If you cannot resolve an issue in 2 turns, offer to escalate
- Never make up information — say "I'll look that up" and call a tool
- Always confirm the ticket number when creating a support ticket

Tone: Professional but warm. Avoid technical jargon.
```

### First Message Prompt

```
A customer has started a new support session.

Customer query: {CUSTOMER_MESSAGE}
Customer email (if provided): {EMAIL_OR_UNKNOWN}

Greet them, understand their issue, and resolve it using your available tools.
If you need to look up their account, ask for their email address.
```

### Escalation Prompt

```
The customer's issue has not been resolved after multiple attempts.

Conversation history:
{CONVERSATION_SUMMARY}

Create a support ticket summarizing:
1. The issue description
2. Steps already attempted
3. Customer's contact information
4. Recommended next action for the human agent

Then inform the customer that a human agent will follow up.
```

---

## Implementation Examples

<details open>
<summary><strong>Node.js / TypeScript</strong></summary>

```typescript
import { CopilotClient, defineTool } from "@github/copilot-sdk";

const searchKnowledgeBase = defineTool("search_knowledge_base", {
    description: "Search the product knowledge base for answers to customer questions",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "The search query" },
        },
        required: ["query"],
    },
    handler: async ({ query }) => {
        // Replace with your actual knowledge base search
        const results = await fetch(`https://your-kb.example.com/search?q=${encodeURIComponent(query)}`);
        return await results.json();
    },
});

const lookupAccount = defineTool("lookup_account", {
    description: "Look up customer account details by email address",
    parameters: {
        type: "object",
        properties: {
            email: { type: "string", description: "Customer email address" },
        },
        required: ["email"],
    },
    handler: async ({ email }) => {
        // Replace with your CRM or database query
        return {
            name: "Jane Smith",
            plan: "Pro",
            account_status: "active",
            open_tickets: 0,
        };
    },
});

const createTicket = defineTool("create_ticket", {
    description: "Create a support ticket for an unresolved issue",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            customer_email: { type: "string" },
        },
        required: ["title", "description", "priority", "customer_email"],
    },
    handler: async (args) => {
        // Replace with your ticketing system API call
        return { ticket_id: `TKT-${Date.now()}`, status: "created" };
    },
});

const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    streaming: true,
    systemMessage: {
        content: `You are a helpful customer support agent for Acme Corp.
Use available tools to look up information and resolve customer issues.
Always be concise and friendly.`,
    },
    tools: [searchKnowledgeBase, lookupAccount, createTicket],
});

// Stream responses to the customer
session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});

// Simulate a customer message
await session.sendAndWait({
    prompt: "Hi, I can't log into my account. My email is jane@example.com",
});

await client.stop();
process.exit(0);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import asyncio
import sys
from copilot import CopilotClient
from copilot.tools import define_tool
from copilot.generated.session_events import SessionEventType
from pydantic import BaseModel, Field

class SearchKBParams(BaseModel):
    query: str = Field(description="The search query")

class LookupAccountParams(BaseModel):
    email: str = Field(description="Customer email address")

class CreateTicketParams(BaseModel):
    title: str
    description: str
    priority: str = Field(description="low, medium, or high")
    customer_email: str

@define_tool(description="Search the product knowledge base")
async def search_knowledge_base(params: SearchKBParams) -> dict:
    # Replace with your actual KB API
    return {"results": [f"Article about {params.query}"]}

@define_tool(description="Look up customer account by email")
async def lookup_account(params: LookupAccountParams) -> dict:
    return {"name": "Jane Smith", "plan": "Pro", "status": "active"}

@define_tool(description="Create a support ticket")
async def create_ticket(params: CreateTicketParams) -> dict:
    import time
    return {"ticket_id": f"TKT-{int(time.time())}", "status": "created"}

async def main():
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "streaming": True,
        "system_message": {
            "content": (
                "You are a helpful customer support agent for Acme Corp. "
                "Use available tools to look up information and resolve issues."
            )
        },
        "tools": [search_knowledge_base, lookup_account, create_ticket],
    })

    def handle_event(event):
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()

    session.on(handle_event)

    await session.send_and_wait({
        "prompt": "Hi, I can't log into my account. My email is jane@example.com"
    })
    print()
    await client.stop()

asyncio.run(main())
```

</details>

---

## Multi-Turn Conversation Pattern

Sessions maintain context automatically. Use a loop to handle multi-turn conversations:

```typescript
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = () => rl.question("Customer: ", async (input) => {
    if (input.toLowerCase() === "exit") {
        await client.stop();
        rl.close();
        return;
    }
    process.stdout.write("Agent: ");
    await session.sendAndWait({ prompt: input });
    console.log("\n");
    ask();
});

ask();
```

---

## Escalation Logic

Build escalation logic into your system message or as a tool:

```typescript
const escalateToHuman = defineTool("escalate_to_human", {
    description: "Escalate the issue to a human support agent when it cannot be resolved automatically",
    parameters: {
        type: "object",
        properties: {
            reason: { type: "string", description: "Why escalation is needed" },
            ticket_id: { type: "string", description: "Existing ticket ID if available" },
        },
        required: ["reason"],
    },
    handler: async ({ reason, ticket_id }) => {
        // Notify your on-call team (PagerDuty, Slack, etc.)
        console.log(`🔔 Escalating to human: ${reason} (Ticket: ${ticket_id ?? "new"})`);
        return { escalated: true, estimated_wait: "5-10 minutes" };
    },
});
```

---

## Related Resources

- [Agent Skill: Customer Support](../../agents/customer-support-agent/README.md)
- [Code Review Agent](./code-review-agent.md)
- [Session Persistence Guide](../guides/session-persistence.md)
- [Prompt Templates Reference](./README.md#common-prompt-templates)
