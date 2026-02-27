"""
Data Analyst Agent — Python example

Usage:
    DATABASE_URL=postgresql://... uv run python python.py
    # Or without a database (uses simulated data):
    uv run python python.py
"""
import asyncio
import math
import os
import sys

from pydantic import BaseModel, Field

from copilot import CopilotClient
from copilot.generated.session_events import SessionEventType
from copilot.tools import define_tool


# ---------------------------------------------------------------------------
# Tool: execute a read-only SQL query
# ---------------------------------------------------------------------------


class RunSqlParams(BaseModel):
    sql: str = Field(description="SELECT query to execute")
    limit: int = Field(default=100, description="Maximum rows to return")


@define_tool(description="Execute a read-only SQL query and return results")
async def run_sql_query(params: RunSqlParams) -> dict:
    # Validate read-only: only SELECT/WITH allowed; block semicolons to prevent stacked queries
    normalized = params.sql.strip().upper()
    if not (normalized.startswith("SELECT") or normalized.startswith("WITH")):
        return {"error": "Only SELECT queries are permitted"}
    if ";" in params.sql:
        return {"error": "Semicolons are not permitted in queries"}

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # Simulated response when no DB is configured
        return {
            "columns": ["date", "product", "revenue", "orders"],
            "rows": [
                ["2024-01-01", "Widget Pro", 12500.00, 245],
                ["2024-01-02", "Widget Lite", 8200.50, 167],
            ],
            "row_count": 2,
            "note": "Simulated data — configure DATABASE_URL to use a real database",
        }
    return {"error": "Connect a database client here (e.g. asyncpg, aiomysql)"}


# ---------------------------------------------------------------------------
# Tool: load a CSV file (with path traversal protection)
# ---------------------------------------------------------------------------


class LoadCsvParams(BaseModel):
    file_path: str = Field(
        description="Relative path to the CSV file within the application's data directory"
    )
    rows: int = Field(default=50, description="Number of rows to return")


@define_tool(description="Load a CSV file from the data directory and return its contents for analysis")
async def load_csv(params: LoadCsvParams) -> dict:
    import csv
    import os.path as osp

    file_path = params.file_path

    # Reject absolute paths and path traversal attempts
    if osp.isabs(file_path) or ".." in file_path:
        return {"error": "Invalid file path. Only relative paths within the data directory are allowed."}
    if not file_path.lower().endswith(".csv"):
        return {"error": "Only .csv files are supported."}

    data_dir = os.environ.get("DATA_DIR", os.getcwd())
    data_dir = osp.realpath(data_dir)
    resolved_path = osp.realpath(osp.join(data_dir, file_path))

    if not resolved_path.startswith(data_dir + osp.sep) and resolved_path != data_dir:
        return {"error": "Access outside of the data directory is not allowed."}

    try:
        with open(resolved_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            data = []
            total = 0
            for row in reader:
                total += 1
                if total <= params.rows:
                    data.append(dict(row))
        return {"columns": list(headers), "preview": data, "total_rows": total}
    except OSError as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Tool: compute descriptive statistics
# ---------------------------------------------------------------------------


class ComputeStatsParams(BaseModel):
    data: list[float] = Field(description="Array of numeric values")
    column_name: str = Field(default="value", description="Column name for labeling")


@define_tool(description="Compute descriptive statistics for a numeric array")
async def compute_stats(params: ComputeStatsParams) -> dict:
    values = params.data
    if not values:
        return {"error": "Empty array"}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    total = sum(sorted_vals)
    mean = total / n
    variance = sum((x - mean) ** 2 for x in sorted_vals) / n
    mid = n // 2
    median = (
        (sorted_vals[mid - 1] + sorted_vals[mid]) / 2 if n % 2 == 0 else sorted_vals[mid]
    )
    p25 = sorted_vals[int(n * 0.25)]
    p75 = sorted_vals[int(n * 0.75)]
    return {
        "column": params.column_name,
        "count": n,
        "min": sorted_vals[0],
        "max": sorted_vals[-1],
        "mean": round(mean, 2),
        "median": round(median, 2),
        "std_dev": round(math.sqrt(variance), 2),
        "p25": p25,
        "p75": p75,
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
                "You are a senior data analyst assistant. "
                "Execute SQL queries and analyze data to answer business questions. "
                "Show SQL before executing. Round numbers to 2 decimal places. "
                "Always highlight key insights, trends, and anomalies. "
                "Suggest follow-up questions to deepen the analysis."
            )
        },
        "tools": [run_sql_query, load_csv, compute_stats],
    })

    def handle_event(event) -> None:
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()
        if event.type == SessionEventType.SESSION_IDLE:
            sys.stdout.write("\n\n")
            sys.stdout.flush()

    session.on(handle_event)

    print("📊 Data Analyst Agent (type 'exit' to quit)\n")
    print("   Try: 'What were our top 5 products last month?'\n")

    while True:
        try:
            user_input = input("Analyst: ").strip()
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
