import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { readFileSync } from "fs";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Tool: execute a read-only SQL query
// ---------------------------------------------------------------------------
const runSqlQuery = defineTool("run_sql_query", {
    description: "Execute a read-only SQL query and return results",
    parameters: {
        type: "object",
        properties: {
            sql: { type: "string", description: "SELECT query to execute" },
            limit: { type: "number", description: "Maximum rows to return", default: 100 },
        },
        required: ["sql"],
    },
    handler: async ({ sql, limit = 100 }) => {
        // Validate read-only: only SELECT/WITH allowed; block semicolons to prevent stacked queries
        const normalized = sql.trim().toUpperCase();
        if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
            return { error: "Only SELECT queries are permitted" };
        }
        if (sql.includes(";")) {
            return { error: "Semicolons are not permitted in queries" };
        }
        // Replace with your actual database client (pg, mysql2, better-sqlite3, etc.)
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            // Simulated response when no DB is configured
            return {
                columns: ["date", "product", "revenue", "orders"],
                rows: [
                    ["2024-01-01", "Widget Pro", 12500.00, 245],
                    ["2024-01-02", "Widget Lite", 8200.50, 167],
                ],
                row_count: 2,
                note: "Simulated data — configure DATABASE_URL to use a real database",
            };
        }
        return { error: "Connect a database client here (e.g. pg, mysql2)" };
    },
});

// ---------------------------------------------------------------------------
// Tool: load a CSV file (with path traversal protection)
// ---------------------------------------------------------------------------
const loadCsv = defineTool("load_csv", {
    description: "Load a CSV file from the data directory and return its contents for analysis",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "Relative path to the CSV file within the application's data directory",
            },
            rows: { type: "number", description: "Number of rows to return", default: 50 },
        },
        required: ["file_path"],
    },
    handler: async ({ file_path, rows = 50 }) => {
        const path = await import("path");

        // Reject absolute paths and path traversal attempts
        if (path.isAbsolute(file_path) || file_path.includes("..")) {
            return { error: "Invalid file path. Only relative paths within the data directory are allowed." };
        }
        if (!file_path.toLowerCase().endsWith(".csv")) {
            return { error: "Only .csv files are supported." };
        }

        const dataDir = process.env.DATA_DIR ?? process.cwd();
        const resolvedDataDir = path.resolve(dataDir);
        const resolvedPath = path.resolve(resolvedDataDir, file_path);

        if (!resolvedPath.startsWith(resolvedDataDir + path.sep) && resolvedPath !== resolvedDataDir) {
            return { error: "Access outside of the data directory is not allowed." };
        }

        try {
            const content = readFileSync(resolvedPath, "utf-8");
            const lines = content.split("\n").filter(Boolean);
            const headers = lines[0]?.split(",") ?? [];
            const data = lines.slice(1, rows + 1).map((line) => {
                const values = line.split(",");
                return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
            });
            return {
                columns: headers,
                preview: data,
                total_rows: lines.length - 1,
            };
        } catch (err: unknown) {
            return { error: String(err) };
        }
    },
});

// ---------------------------------------------------------------------------
// Tool: compute descriptive statistics
// ---------------------------------------------------------------------------
const computeStats = defineTool("compute_stats", {
    description: "Compute descriptive statistics for a numeric array",
    parameters: {
        type: "object",
        properties: {
            data: { type: "array", items: { type: "number" }, description: "Array of numeric values" },
            column_name: { type: "string", description: "Column name for labeling" },
        },
        required: ["data"],
    },
    handler: async ({ data, column_name = "value" }) => {
        if (!data.length) return { error: "Empty array" };
        const sorted = [...data].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const mean = sum / sorted.length;
        const variance = sorted.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sorted.length;
        const median = sorted.length % 2 === 0
            ? ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
            : sorted[Math.floor(sorted.length / 2)] ?? 0;
        const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
        const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        return {
            column: column_name,
            count: sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean: Math.round(mean * 100) / 100,
            median: Math.round(median * 100) / 100,
            std_dev: Math.round(Math.sqrt(variance) * 100) / 100,
            p25,
            p75,
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
        content: `You are a senior data analyst assistant.
Execute SQL queries and analyze data to answer business questions.
Show SQL before executing. Round numbers to 2 decimal places.
Always highlight key insights, trends, and anomalies.
Suggest follow-up questions to deepen the analysis.`,
    },
    tools: [runSqlQuery, loadCsv, computeStats],
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => process.stdout.write("\n\n"));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("📊 Data Analyst Agent (type 'exit' to quit)\n");
console.log("   Try: 'What were our top 5 products last month?'\n");

const prompt = () => {
    rl.question("Analyst: ", async (input) => {
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
