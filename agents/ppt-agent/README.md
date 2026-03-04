# PPT Agent

A conversational PowerPoint authoring assistant that creates new presentations and updates existing ones from natural language instructions.

## Quick Start

```bash
# Python (supports create + update — recommended)
pip install python-pptx
uv run python examples/python.py

# Node.js (create-only, no external file editing required)
npm install pptxgenjs
npx tsx examples/nodejs.ts
```

## What This Agent Does

- Creates new PowerPoint presentations from scratch or from a template
- Opens and inspects existing `.pptx` files
- Adds text slides with title and body content
- Adds image slides with positioning and sizing
- Adds table slides from structured row/column data
- Adds chart slides (bar, column, line, pie, area)
- Updates text on any existing slide by index
- Deletes slides by index
- Lists all slides with title and content preview
- Saves presentations to a configurable output directory

## Language Notes

| Capability | Python (`python-pptx`) | Node.js (`pptxgenjs`) |
|---|---|---|
| Create new presentations | Yes | Yes |
| Open & update existing `.pptx` | **Yes** | No (by design — see [pptxgenjs#912](https://github.com/gitbrent/PptxGenJS/issues/912)) |
| Text slides | Yes | Yes |
| Image slides | Yes | Yes |
| Table slides | Yes | Yes |
| Chart slides | Yes | Yes |

> Use the Python example when you need to modify existing presentations. Use the Node.js example for pure generation workflows.

## Tools

| Tool | Python | Node.js | Description |
|------|--------|---------|-------------|
| `create_presentation` | Yes | Yes | Create a new `.pptx` file, optionally from a template |
| `open_presentation` | Yes | — | Open an existing `.pptx` and return its slide structure |
| `list_slides` | Yes | — | List all slides with titles and content preview |
| `add_text_slide` | Yes | Yes | Add a title + body text slide |
| `add_image_slide` | Yes | Yes | Add a title + image slide |
| `add_table_slide` | Yes | Yes | Add a title + table slide from row/column data |
| `add_chart_slide` | Yes | Yes | Add a title + chart slide (bar, column, line, pie, area) |
| `update_slide_text` | Yes | — | Replace text on a placeholder of an existing slide |
| `delete_slide` | Yes | — | Remove a slide by index |
| `save_presentation` | Yes | Yes | Save (or save-as) the presentation to a new path |

## Configuration

```bash
# Required
COPILOT_GITHUB_TOKEN=<your-token>   # or GH_TOKEN

# Optional — Python only
PPTX_OUTPUT_DIR=./output            # Directory for output files (default: current directory)
PPTX_ASSETS_DIR=./assets            # Directory for image assets (default: current directory)

# Optional — Node.js only
PPTX_OUTPUT_DIR=./output            # Directory for output files (default: current directory)
PPTX_ASSETS_DIR=./assets            # Directory for image assets (default: current directory)
```

## Security

- **Path traversal protection**: all file paths are validated and resolved against the configured output and assets directories. Absolute paths and paths containing `..` are rejected. Symlink targets are resolved before the directory scope check.
- **Extension enforcement**: only `.pptx` files are accepted for presentation paths.
- **Asset scoping**: image files must reside within `PPTX_ASSETS_DIR`.
- **Slide index bounds**: all slide index operations are validated before execution.

## Example Prompts

```
Create a quarterly business review presentation with 5 slides:
1. Title slide: "Q3 2024 Business Review"
2. Agenda slide with 4 bullet points
3. Revenue chart (bar) comparing Q1–Q3
4. Key achievements table with 3 columns
5. Next steps text slide
Save it to "q3_review.pptx"
```

```
Open my existing presentation "team_update.pptx", list all slides,
then update slide 2 title to "Updated Metrics" and add a new chart
slide at the end showing monthly growth data.
```

## Full Documentation

See [Use Case: PPT Agent](../../docs/use-cases/ppt-agent.md) for detailed documentation, prompt patterns, and integration examples.
