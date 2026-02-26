import { CopilotClient, defineTool } from "@github/copilot-sdk";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Tool definitions — replace with your actual API implementations
// ---------------------------------------------------------------------------

const searchKnowledgeBase = defineTool("search_knowledge_base", {
    description: "Search the product knowledge base for answers to customer questions",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Natural language search query" },
        },
        required: ["query"],
    },
    handler: async ({ query }) => {
        // Replace with your actual KB API call
        const kbUrl = process.env.KB_API_URL;
        if (kbUrl) {
            const res = await fetch(`${kbUrl}/search?q=${encodeURIComponent(query)}`);
            return await res.json();
        }
        // Simulated response for demonstration
        return {
            results: [
                {
                    title: "Password Reset Guide",
                    content: "Go to Settings > Security > Reset Password to change your password.",
                    url: "https://docs.example.com/password-reset",
                },
            ],
            total: 1,
        };
    },
});

const lookupAccount = defineTool("lookup_account", {
    description: "Look up customer account information by email address",
    parameters: {
        type: "object",
        properties: {
            email: { type: "string", description: "Customer email address" },
        },
        required: ["email"],
    },
    handler: async ({ email }) => {
        // Replace with your CRM/database query
        return {
            found: true,
            customer_id: "cust_12345",
            name: "Jane Smith",
            email,
            plan: "Pro",
            account_status: "active",
            open_tickets: 0,
            created_at: "2023-01-15",
        };
    },
});

const createTicket = defineTool("create_ticket", {
    description: "Create a support ticket for issues requiring follow-up",
    parameters: {
        type: "object",
        properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            customer_email: { type: "string" },
            category: { type: "string" },
        },
        required: ["title", "description", "priority", "customer_email"],
    },
    handler: async ({ title, priority, customer_email }) => {
        const ticketId = `TKT-${Date.now()}`;
        console.error(`\n[Ticket Created] ${ticketId}: ${title} (${priority}) for ${customer_email}`);
        return {
            ticket_id: ticketId,
            status: "open",
            estimated_response: priority === "high" ? "2 hours" : "24 hours",
        };
    },
});

const escalateToHuman = defineTool("escalate_to_human", {
    description: "Escalate an unresolved issue to a human support agent",
    parameters: {
        type: "object",
        properties: {
            reason: { type: "string" },
            ticket_id: { type: "string" },
            priority: { type: "string", enum: ["normal", "urgent"] },
        },
        required: ["reason"],
    },
    handler: async ({ reason, ticket_id, priority = "normal" }) => {
        console.error(`\n[Escalation] ${priority.toUpperCase()}: ${reason} (${ticket_id ?? "no ticket"})`);
        return {
            escalated: true,
            queue_position: priority === "urgent" ? 1 : 5,
            estimated_wait: priority === "urgent" ? "5 minutes" : "30 minutes",
        };
    },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    streaming: true,
    systemMessage: {
        content: `You are a friendly and knowledgeable customer support agent for Acme Corp.
Use your tools to look up information and resolve customer issues accurately.
Never guess or make up information — always use a tool first.
Keep responses concise and warm. After resolving an issue, ask if there is anything else you can help with.`,
    },
    tools: [searchKnowledgeBase, lookupAccount, createTicket, escalateToHuman],
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => process.stdout.write("\n\n"));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("💬 Customer Support Agent (type 'exit' to quit)\n");

const prompt = () => {
    rl.question("Customer: ", async (input) => {
        if (input.toLowerCase() === "exit") {
            await client.stop();
            rl.close();
            return;
        }
        process.stdout.write("Agent: ");
        await session.sendAndWait({ prompt: input });
        prompt();
    });
};

prompt();
