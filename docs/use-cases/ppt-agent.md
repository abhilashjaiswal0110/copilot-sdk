# Use Case: PPT Agent

A conversational PowerPoint authoring assistant that creates new presentations and edits existing `.pptx` files from natural language instructions — supporting text, images, tables, and charts.

## Overview

The PPT Agent wraps `python-pptx` (Python) and `pptxgenjs` (Node.js) behind a set of well-defined tools that Copilot orchestrates from natural language. Users describe what they want in plain English; the agent sequences tool calls to produce the correct `.pptx` output.

| Capability | Python (`python-pptx`) | Node.js (`pptxgenjs`) |
|---|---|---|
| Create new presentations | Yes | Yes |
| Open & update existing `.pptx` | **Yes** | No (library limitation) |
| All content types | Yes | Yes |
| Recommended for | All workflows | Pure generation only |

---

## Architecture

```
User Prompt (natural language)
         │
         ▼
  Copilot SDK Session
  (gpt-4.1, streaming, custom system prompt)
         │
         ▼
  Tool Orchestration
  ┌─────────────────────────────────────────────────────┐
  │  create_presentation   open_presentation             │
  │  list_slides           add_text_slide                │
  │  add_image_slide       add_table_slide               │
  │  add_chart_slide       update_slide_text             │
  │  delete_slide          save_presentation             │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  python-pptx / pptxgenjs
  (file I/O via asyncio.to_thread for thread-safety)
         │
         ▼
  Output: .pptx file
```

---

## Tool Reference

### `create_presentation`
Creates a new `.pptx` file on disk (Python) or an in-memory session (Node.js). Optionally accepts a `.pptx` template to inherit the slide master and theme.

### `open_presentation` *(Python only)*
Opens an existing `.pptx` and returns the slide count and per-slide metadata (index, title, layout name).

### `list_slides` *(Python only)*
Returns all slides with their titles and a short content preview — useful for letting the agent orient itself before making targeted edits.

### `add_text_slide`
Adds a "Title and Content" slide. Body text is split on `\n` into bullet points. Python preserves existing theme fonts; Node.js applies a clean default style.

### `add_image_slide`
Adds a blank slide with a title text box and a positioned image. Dimensions are specified in inches. Images are validated against `PPTX_ASSETS_DIR` to prevent path traversal.

### `add_table_slide`
Adds a slide with a styled table. Headers are rendered with a dark-blue fill and white text; alternating rows have a light-blue tint for readability.

### `add_chart_slide`
Adds a slide with a chart. Supported types: `bar`, `column`, `line`, `pie`, `area`. Each series carries a name and an array of numeric values aligned to the categories array.

### `update_slide_text` *(Python only)*
Replaces the text of a specific placeholder on an existing slide (index 0 = title, 1 = body, etc.).

### `delete_slide` *(Python only)*
Removes a slide by zero-based index using the OOXML slide list manipulation (`_sldIdLst`).

### `save_presentation`
Python: saves a copy to a new path (save-as). Node.js: writes the in-memory `pptxgen` object to disk for the first time.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `COPILOT_GITHUB_TOKEN` | — | GitHub Copilot authentication token |
| `PPTX_OUTPUT_DIR` | `./` (cwd) | Directory for output `.pptx` files |
| `PPTX_ASSETS_DIR` | `./` (cwd) | Directory from which image assets are served |

---

## Security Design

### Path traversal protection
All file path parameters are resolved using `os.path.realpath` (Python) / `fs.realpathSync` (Node.js) and checked to ensure they remain inside the configured `PPTX_OUTPUT_DIR` or `PPTX_ASSETS_DIR`. Absolute paths and paths containing `..` are rejected immediately. Symlink targets are resolved before the directory check, preventing symlink-based escape attacks.

### Extension enforcement
Only `.pptx` files are accepted for presentation parameters. Only known image extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`) are accepted for image parameters.

### Slide-index bounds checking
`update_slide_text` and `delete_slide` validate that the requested index is within the actual slide count before touching the file.

### Thread-safe file I/O (Python)
All `python-pptx` operations run inside `asyncio.to_thread()` so the async event loop is never blocked by file I/O.

---

## Prompt Patterns

### Create a full deck from scratch

```
Create a new presentation at "q3_review.pptx" with the following slides:
1. Title slide — "Q3 2024 Business Review"
2. Agenda — bullets: Overview, Revenue, Costs, Headcount, Outlook
3. Column chart "Quarterly Revenue" — categories Q1/Q2/Q3, series Revenue: 1.2/1.5/1.9 and Target: 1.0/1.3/1.8
4. Table "Key Metrics" — columns Metric/Q2/Q3/Change and 4 data rows
5. Text slide "Next Steps" with 3 action items
Save it when done.
```

### Open and update an existing deck

```
Open "board_update.pptx" and list all slides.
Update slide 0 title to "Board Update — November 2024".
Delete slide 4.
Add a new line chart "Monthly Active Users" with categories Jan–Jun,
series 2023: 10,12,11,14,13,15 and 2024: 12,15,14,18,17,20.
Save as "board_update_final.pptx".
```

### Template-based generation

```
Create a new presentation using "corporate_template.pptx" as the base,
output to "project_kickoff.pptx".
Add a title slide "Project Phoenix — Kickoff".
Add an agenda slide with 5 bullets.
Add a table "Team Roster" with columns Name/Role/Location and 6 rows.
Save it.
```

### Add a chart to an existing deck

```
Open "sales_report.pptx" — how many slides does it have?
Add a pie chart slide "Revenue by Region" with categories
EMEA/AMER/APAC and series Revenue: 45/35/20.
Save in place.
```

### Bulk slide generation from data

```
I have monthly revenue data:
Jan: 120k, Feb: 135k, Mar: 128k, Apr: 142k, May: 155k, Jun: 168k

Create a new presentation "revenue_h1.pptx" with:
- A title slide "H1 Revenue Report"
- A line chart of the monthly data
- A table summarizing each month with a % change column
- A text slide with 3 key takeaways
Save it.
```

---

## Integration Patterns

### Automated reporting pipeline

```python
# Schedule this to run nightly; Copilot generates the deck from a data prompt
import asyncio
from copilot import CopilotClient
from copilot.tools import define_tool
# ... (import ppt tools)

async def nightly_report(data_summary: str) -> str:
    client = CopilotClient()
    await client.start()
    session = await client.create_session({"tools": _ALL_TOOLS})
    result = await session.send_and_wait(
        f"Create a nightly ops report from this data:\n{data_summary}\n"
        f"Save to reports/ops_{today}.pptx"
    )
    await client.stop()
    return result.data.content
```

### API endpoint (FastAPI)

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class DeckRequest(BaseModel):
    prompt: str
    output_filename: str

@app.post("/generate-deck")
async def generate_deck(req: DeckRequest):
    # Initialize session, send prompt, return file path
    ...
```

---

## Dependencies

### Python
```bash
pip install python-pptx   # presentation creation and editing
# python-pptx pulls in lxml automatically (used for delete_slide XML manipulation)
```

### Node.js
```bash
npm install pptxgenjs      # presentation creation only
npm install -D tsx typescript @types/node
```

---

## Known Limitations

| Limitation | Applies to | Notes |
|---|---|---|
| Cannot update existing `.pptx` | Node.js only | Use Python example for update workflows |
| SmartArt / animations not supported | Both | python-pptx preserves but cannot author them |
| Embedded videos not supported | Both | Use native PowerPoint for multimedia |
| Chart styling is basic | Both | Fine for data communication; not pixel-perfect design |
| Slide master / theme edits not supported | Both | Use a template file to control branding |
