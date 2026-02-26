# Use Case: Data Analysis Agent

Use the GitHub Copilot SDK to build a conversational data analysis assistant that queries datasets, generates insights, and produces reports through natural language.

## Overview

A data analysis agent can:
- Execute SQL queries against databases
- Load and analyze CSV/JSON files
- Compute statistics and identify trends
- Generate visualizations (chart specs or scripts)
- Produce written reports and summaries
- Answer ad-hoc questions about your data

---

## Architecture

```
Analyst / Business User
         ↓
   Data Analysis Agent
         ↓ (Tool calls)
┌────────┴─────────┐
│ run_sql_query     │  load_csv  │  compute_stats  │  generate_chart │
└───────────────────────────────────────────────────────────────────┘
         ↓
   Insights & Reports
```

---

## Prompt Templates

### System Message

```
You are a senior data analyst and business intelligence expert.

Your capabilities:
- Write and execute SQL queries
- Load and analyze structured data files (CSV, JSON)
- Compute descriptive statistics and detect anomalies
- Generate chart specifications for visualization
- Write clear, executive-ready data summaries

Guidelines:
- Always clarify ambiguous questions before running queries
- Show your SQL before executing it, unless the user says otherwise
- When sharing numbers, round to 2 decimal places for readability
- Highlight anomalies and outliers explicitly
- Suggest follow-up questions to deepen the analysis

Data context: {DATA_SCHEMA_DESCRIPTION}
```

### Exploratory Analysis Prompt

```
Perform an exploratory data analysis on the {DATASET_NAME} dataset.

Provide:
1. Dataset shape (rows, columns) and data types
2. Missing values summary
3. Descriptive statistics for numeric columns
4. Distribution of key categorical columns
5. Top 5 correlations between numeric columns
6. Three actionable insights based on the data

Use the available tools to fetch and analyze the data.
```

### Business Report Prompt

```
Generate a weekly business report for {METRIC_NAME}.

Time period: {DATE_RANGE}
Compare against: previous period and same period last year

Include:
- Headline metric with % change
- Trend chart specification (use Vega-Lite format)
- Top 3 contributing factors
- Segments with highest/lowest performance
- Anomalies or outliers worth investigating
- Recommended actions

Return the report in Markdown format.
```

### Ad-hoc Query Prompt

```
Answer the following business question using SQL:

Question: {BUSINESS_QUESTION}

Available tables and their schemas:
{SCHEMA_CONTEXT}

Show the SQL query you run and explain the results in plain English.
If the question is ambiguous, state your assumptions.
```

---

## Implementation Examples

<details open>
<summary><strong>Node.js / TypeScript</strong></summary>

```typescript
import { CopilotClient, defineTool } from "@github/copilot-sdk";

// Tool: execute a read-only SQL query
const runSqlQuery = defineTool("run_sql_query", {
    description: "Execute a read-only SQL query and return results",
    parameters: {
        type: "object",
        properties: {
            sql: { type: "string", description: "The SQL query to execute" },
            limit: { type: "number", description: "Maximum rows to return", default: 100 },
        },
        required: ["sql"],
    },
    handler: async ({ sql, limit = 100 }) => {
        // Replace with your actual database client
        // e.g., pg, mysql2, better-sqlite3
        console.log(`Executing SQL:\n${sql}`);
        // Simulated result for demonstration
        return {
            columns: ["date", "revenue", "orders"],
            rows: [
                ["2024-01-01", 12500.00, 245],
                ["2024-01-02", 13200.50, 267],
            ],
            row_count: 2,
        };
    },
});

const loadCsv = defineTool("load_csv", {
    description: "Load a CSV file from the data directory and return its contents as structured data",
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
        const { readFileSync } = await import("fs");
        const path = await import("path");

        // Reject absolute paths and path traversal attempts
        if (path.isAbsolute(file_path) || file_path.includes("..")) {
            return { error: "Invalid file path. Only relative paths within the data directory are allowed." };
        }
        if (!file_path.toLowerCase().endsWith(".csv")) {
            return { error: "Invalid file type. Only .csv files can be loaded." };
        }

        const dataDir = process.env.DATA_DIR ?? process.cwd();
        const resolvedDataDir = path.resolve(dataDir);
        const resolvedPath = path.resolve(resolvedDataDir, file_path);

        // Ensure resolved path stays inside the data directory
        if (!resolvedPath.startsWith(resolvedDataDir + path.sep) && resolvedPath !== resolvedDataDir) {
            return { error: "Access outside of the data directory is not allowed." };
        }

        const content = readFileSync(resolvedPath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const headers = lines[0]?.split(",") ?? [];
        const preview = lines.slice(1, rows + 1).map((line) => {
            const values = line.split(",");
            return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
        });
        return { columns: headers, preview, total_rows: lines.length - 1 };
    },
});

const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    streaming: true,
    systemMessage: {
        content: `You are a data analyst assistant.
Execute SQL queries and analyze data files to answer business questions.
Always show your reasoning and highlight key insights.`,
    },
    tools: [runSqlQuery, loadCsv],
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});

await session.sendAndWait({
    prompt: "What were our top 5 revenue-generating products last month? Show me the trend.",
});

await client.stop();
process.exit(0);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import asyncio
import csv
import os
import sys
from pathlib import Path
from copilot import CopilotClient
from copilot.tools import define_tool
from copilot.generated.session_events import SessionEventType
from pydantic import BaseModel, Field

class SqlQueryParams(BaseModel):
    sql: str = Field(description="The SQL query to execute")
    limit: int = Field(default=100, description="Maximum rows to return")

class LoadCsvParams(BaseModel):
    file_path: str = Field(description="Path to the CSV file")
    rows: int = Field(default=50, description="Number of rows to preview")

@define_tool(description="Execute a read-only SQL query")
async def run_sql_query(params: SqlQueryParams) -> dict:
    # Replace with your actual database driver (e.g., asyncpg, aiosqlite)
    print(f"Executing SQL:\n{params.sql}")
    # Simulated result
    return {
        "columns": ["date", "revenue", "orders"],
        "rows": [["2024-01-01", 12500.00, 245], ["2024-01-02", 13200.50, 267]],
        "row_count": 2,
    }

@define_tool(description="Load a CSV file from the data directory and preview its contents")
async def load_csv(params: LoadCsvParams) -> dict:
    # Reject absolute paths and path traversal attempts
    if os.path.isabs(params.file_path) or ".." in params.file_path.split(os.sep):
        return {"error": "Invalid file path. Only relative paths within the data directory are allowed."}
    if not params.file_path.lower().endswith(".csv"):
        return {"error": "Invalid file type. Only .csv files are supported."}

    data_dir = Path(os.environ.get("DATA_DIR", ".")).resolve()
    resolved = (data_dir / params.file_path).resolve()

    # Ensure the resolved path stays inside the data directory
    if not str(resolved).startswith(str(data_dir) + os.sep):
        return {"error": "Access outside of the data directory is not allowed."}
    if not resolved.exists():
        return {"error": f"File not found: {params.file_path}"}

    rows = []
    with resolved.open() as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= params.rows:
                break
            rows.append(row)

    with resolved.open() as f:
        total_rows = sum(1 for _ in f) - 1

    return {"preview": rows, "total_rows": total_rows}

async def main():
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "streaming": True,
        "system_message": {
            "content": (
                "You are a data analyst assistant. "
                "Execute SQL queries and analyze data files to answer business questions. "
                "Always highlight key insights and anomalies."
            )
        },
        "tools": [run_sql_query, load_csv],
    })

    def handle_event(event):
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()

    session.on(handle_event)

    await session.send_and_wait({
        "prompt": "What were our top 5 revenue-generating products last month?"
    })
    print()
    await client.stop()

asyncio.run(main())
```

</details>

---

## Multi-Turn Analysis Session

Data analysis often requires iterative refinement. Use persistent sessions:

```typescript
// Session automatically retains context across turns
await session.sendAndWait({ prompt: "Show me monthly revenue for 2024" });
// Copilot remembers the previous results
await session.sendAndWait({ prompt: "Now break that down by region" });
await session.sendAndWait({ prompt: "Which region had the highest growth rate?" });
await session.sendAndWait({ prompt: "Generate a Markdown summary report of your findings" });
```

---

## Structured Output Pattern

Request structured output for downstream processing:

```typescript
const result = await session.sendAndWait({
    prompt: `Analyze sales data and return ONLY this JSON structure:
{
  "total_revenue": <number>,
  "top_products": [{ "name": string, "revenue": number, "growth_pct": number }],
  "anomalies": [{ "date": string, "description": string }],
  "executive_summary": string
}`,
});

const analysis = JSON.parse(result?.data.content ?? "{}");
```

---

## Chart Specification Generation

Request Vega-Lite chart specs for rendering:

```typescript
await session.sendAndWait({
    prompt: `Generate a Vega-Lite specification for a line chart showing 
monthly revenue from the query results. 
Use a clean, professional style suitable for executive presentations.`,
});
```

---

## Related Resources

- [Agent Skill: Data Analyst](../../agents/data-analyst-agent/README.md)
- [Customer Support Agent](./customer-support-agent.md)
- [DevOps Automation Agent](./devops-automation-agent.md)
- [Session Persistence Guide](../guides/session-persistence.md)
- [Prompt Templates Reference](./README.md#common-prompt-templates)
