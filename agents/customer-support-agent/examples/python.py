"""
Customer Support Agent — Python example

Usage:
    KB_API_URL=https://your-kb.example.com uv run python python.py
"""
import asyncio
import sys
import time
from typing import Optional

from pydantic import BaseModel, Field

from copilot import CopilotClient
from copilot.generated.session_events import SessionEventType
from copilot.tools import define_tool


# ---------------------------------------------------------------------------
# Tool definitions — replace with your actual API implementations
# ---------------------------------------------------------------------------


class SearchKBParams(BaseModel):
    query: str = Field(description="Natural language search query")


class LookupAccountParams(BaseModel):
    email: str = Field(description="Customer email address")


class CreateTicketParams(BaseModel):
    title: str
    description: str
    priority: str = Field(description="low, medium, or high")
    customer_email: str
    category: Optional[str] = None


class EscalateParams(BaseModel):
    reason: str
    ticket_id: Optional[str] = None
    priority: str = "normal"


@define_tool(description="Search the product knowledge base for answers to customer questions")
async def search_knowledge_base(params: SearchKBParams) -> dict:
    import os

    kb_url = os.environ.get("KB_API_URL")
    if kb_url:
        import httpx

        async with httpx.AsyncClient() as http:
            response = await http.get(f"{kb_url}/search", params={"q": params.query})
        return response.json()
    # Simulated response for demonstration
    return {
        "results": [
            {
                "title": "Password Reset Guide",
                "content": "Go to Settings > Security > Reset Password to change your password.",
                "url": "https://docs.example.com/password-reset",
            }
        ],
        "total": 1,
    }


@define_tool(description="Look up customer account information by email address")
async def lookup_account(params: LookupAccountParams) -> dict:
    # Replace with your CRM/database query
    return {
        "found": True,
        "customer_id": "cust_12345",
        "name": "Jane Smith",
        "email": params.email,
        "plan": "Pro",
        "account_status": "active",
        "open_tickets": 0,
        "created_at": "2023-01-15",
    }


@define_tool(description="Create a support ticket for issues requiring follow-up")
async def create_ticket(params: CreateTicketParams) -> dict:
    ticket_id = f"TKT-{int(time.time())}"
    print(
        f"\n[Ticket Created] {ticket_id}: {params.title} ({params.priority}) "
        f"for {params.customer_email}",
        file=sys.stderr,
    )
    return {
        "ticket_id": ticket_id,
        "status": "open",
        "estimated_response": "2 hours" if params.priority == "high" else "24 hours",
    }


@define_tool(description="Escalate an unresolved issue to a human support agent")
async def escalate_to_human(params: EscalateParams) -> dict:
    print(
        f"\n[Escalation] {params.priority.upper()}: {params.reason} "
        f"({params.ticket_id or 'no ticket'})",
        file=sys.stderr,
    )
    return {
        "escalated": True,
        "queue_position": 1 if params.priority == "urgent" else 5,
        "estimated_wait": "5 minutes" if params.priority == "urgent" else "30 minutes",
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "streaming": True,
        "system_message": {
            "content": (
                "You are a friendly and knowledgeable customer support agent for Acme Corp. "
                "Use your tools to look up information and resolve customer issues accurately. "
                "Never guess or make up information — always use a tool first. "
                "Keep responses concise and warm. After resolving an issue, ask if there is "
                "anything else you can help with."
            )
        },
        "tools": [search_knowledge_base, lookup_account, create_ticket, escalate_to_human],
    })

    def handle_event(event) -> None:
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()
        if event.type == SessionEventType.SESSION_IDLE:
            sys.stdout.write("\n\n")
            sys.stdout.flush()

    session.on(handle_event)

    print("💬 Customer Support Agent (type 'exit' to quit)\n")

    while True:
        try:
            user_input = input("Customer: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_input.lower() == "exit":
            break
        if not user_input:
            continue
        sys.stdout.write("Agent: ")
        sys.stdout.flush()
        await session.send_and_wait({"prompt": user_input})

    await client.stop()


if __name__ == "__main__":
    asyncio.run(main())
