import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { execFile } from "child_process";
import { promisify } from "util";
import * as readline from "readline";

const execFileAsync = promisify(execFile);

/** Kubernetes name pattern: lowercase alphanumeric and hyphens only */
const K8S_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
/** Duration pattern for --since flag: e.g. 1h, 30m, 2h30m */
const DURATION_PATTERN = /^[0-9]+(h|m|s)$/;

// ---------------------------------------------------------------------------
// Tool: run read-only kubectl commands
// ---------------------------------------------------------------------------
const ALLOWED_KUBECTL_SUBCOMMANDS = ["get", "describe", "logs", "top", "rollout"];

const runKubectl = defineTool("run_kubectl", {
    description: "Execute a read-only kubectl command to inspect cluster state",
    parameters: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "kubectl arguments, e.g. 'get pods -n production'",
            },
        },
        required: ["command"],
    },
    handler: async ({ command }) => {
        const args = command.trim().split(/\s+/).filter(Boolean);
        if (args.length === 0) {
            return { error: "No command provided" };
        }
        const subcommand = args[0] ?? "";
        const isAllowed = ALLOWED_KUBECTL_SUBCOMMANDS.some((prefix) => subcommand === prefix);
        if (!isAllowed) {
            return { error: `Only read-only kubectl commands are permitted. Allowed: ${ALLOWED_KUBECTL_SUBCOMMANDS.join(", ")}` };
        }
        try {
            const { stdout, stderr } = await execFileAsync("kubectl", args);
            return { output: stdout, stderr };
        } catch (err: unknown) {
            return { error: String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: fetch application logs
// ---------------------------------------------------------------------------
const fetchLogs = defineTool("fetch_logs", {
    description: "Fetch recent logs for a service",
    parameters: {
        type: "object",
        properties: {
            service: { type: "string", description: "App label selector value" },
            namespace: { type: "string", default: "production" },
            lines: { type: "number", default: 100 },
            since: { type: "string", default: "1h", description: "Duration, e.g. 1h, 30m" },
        },
        required: ["service"],
    },
    handler: async ({ service, namespace = "production", lines = 100, since = "1h" }) => {
        if (!K8S_NAME_PATTERN.test(service)) {
            return { error: "Invalid service name. Use lowercase alphanumeric characters and hyphens only." };
        }
        if (!K8S_NAME_PATTERN.test(namespace)) {
            return { error: "Invalid namespace. Use lowercase alphanumeric characters and hyphens only." };
        }
        if (!DURATION_PATTERN.test(since)) {
            return { error: "Invalid duration format. Use a value like 1h, 30m, or 2h." };
        }
        const safeLines = Math.max(1, Math.min(1000, Math.floor(Number(lines))));
        try {
            const { stdout } = await execFileAsync("kubectl", [
                "logs", "-l", `app=${service}`,
                "-n", namespace,
                `--tail=${safeLines}`,
                `--since=${since}`,
            ]);
            return { logs: stdout };
        } catch (err: unknown) {
            return { error: String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: list recent deployments
// ---------------------------------------------------------------------------
const listRecentDeployments = defineTool("list_recent_deployments", {
    description: "List recent deployment events in a namespace",
    parameters: {
        type: "object",
        properties: {
            namespace: { type: "string", default: "production" },
        },
        required: [],
    },
    handler: async ({ namespace = "production" }) => {
        if (!K8S_NAME_PATTERN.test(namespace)) {
            return { error: "Invalid namespace. Use lowercase alphanumeric characters and hyphens only." };
        }
        try {
            const { stdout } = await execFileAsync("kubectl", [
                "get", "deployments", "-n", namespace, "-o", "json",
            ]);
            const data = JSON.parse(stdout) as { items: Array<{
                metadata: { name: string; creationTimestamp: string };
                spec: { template: { spec: { containers: Array<{ image: string }> } } };
                status: { readyReplicas?: number; replicas?: number };
            }> };
            const deployments = data.items.map((d) => ({
                name: d.metadata.name,
                image: d.spec.template.spec.containers[0]?.image ?? "unknown",
                timestamp: d.metadata.creationTimestamp,
                ready: `${d.status.readyReplicas ?? 0}/${d.status.replicas ?? 0}`,
            }));
            return { deployments };
        } catch (err: unknown) {
            return { error: String(err) };
        }
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
        content: `You are a senior SRE assistant.
Help with incident response, infrastructure health checks, and deployment analysis.
Only run read-only kubectl commands. Always confirm the environment before acting.
Summarize all findings clearly and suggest next investigation steps.`,
    },
    tools: [runKubectl, fetchLogs, listRecentDeployments],
    // Optionally add GitHub MCP for release/PR context:
    // mcpServers: { github: { type: "http", url: "https://api.githubcopilot.com/mcp/" } },
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => process.stdout.write("\n\n"));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("🔧 DevOps Agent (type 'exit' to quit)\n");
console.log("   Try: 'Check the health of api-gateway in production'\n");

const prompt = () => {
    rl.question("Engineer: ", async (input) => {
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
