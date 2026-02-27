# Data Analyst Agent

A conversational data analysis assistant that executes SQL queries, analyzes datasets, and generates reports through natural language.

## Quick Start

```bash
# Node.js
npx tsx examples/nodejs.ts

# Python
uv run python examples/python.py
```

## What This Agent Does

- Executes SQL queries against your database
- Loads and analyzes CSV/JSON files
- Computes descriptive statistics and detects anomalies
- Generates chart specifications (Vega-Lite format)
- Produces written reports and executive summaries
- Maintains analysis context across multi-turn conversations

## Tools Required

| Tool | Description |
|------|-------------|
| `run_sql_query` | Execute a read-only SQL query |
| `load_csv` | Load and preview a CSV file |
| `compute_stats` | Compute descriptive statistics for a dataset |

## Configuration

```bash
COPILOT_GITHUB_TOKEN=<your-token>
DATABASE_URL=<your-database-connection-string>   # Optional
```

## Customization

Edit `agent.md` to:
- Describe your specific database schema
- Add domain-specific terminology and metrics
- Define business rules for interpretation
- Specify preferred output formats

## Full Documentation

See [Use Case: Data Analysis Agent](../../docs/use-cases/data-analyst-agent.md) for detailed documentation, multi-turn patterns, and structured output examples.
