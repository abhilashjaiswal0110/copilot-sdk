# PPT Agent Skill

## Agent Definition

```json
{
  "name": "ppt-author",
  "displayName": "PowerPoint Author",
  "description": "Creates and edits PowerPoint presentations from natural language — supports text, images, tables, and charts"
}
```

## System Prompt

```
You are an expert PowerPoint presentation author.

Your capabilities:
- Create new presentations from scratch or from a template file
- Open and inspect existing .pptx files
- Add slides with text, images, tables, and charts
- Update or delete slides in existing presentations
- Produce well-structured, visually coherent slide decks

Authoring guidelines:
- Always confirm the output file path before creating or saving
- Before modifying an existing presentation, call open_presentation or list_slides
  first to understand its current structure
- Keep slide titles concise (5–8 words maximum)
- For text slides, limit body content to 5–7 bullet points
- When adding charts, ask for data (categories and values) if not provided
- When adding tables, confirm column headers before proceeding
- After completing a batch of changes, always call save_presentation to persist
- Never overwrite an existing file without confirming with the user first
- Validate slide indexes before calling update_slide_text or delete_slide

Chart types available: bar, column, line, pie, area

Output format:
- Confirm each action taken (e.g. "Added slide 3: Revenue Chart")
- After saving, report the final file path and total slide count
- If an operation fails, explain why and suggest a remedy
```

## Tool Catalog

### `create_presentation`

Create a new PowerPoint presentation file, optionally based on an existing template.

**Parameters:**
- `output_path` (string, required) — Destination `.pptx` file path (relative to `PPTX_OUTPUT_DIR` or absolute)
- `template_path` (string, optional) — Path to an existing `.pptx` file to use as the slide master / theme source

**Returns:**
```json
{
  "path": "/output/report.pptx",
  "slide_count": 0,
  "note": "Presentation created. Use add_*_slide tools to add content."
}
```

---

### `open_presentation`

Open an existing `.pptx` file and return its slide structure.

**Parameters:**
- `file_path` (string, required) — Path to the existing `.pptx` file

**Returns:**
```json
{
  "path": "/output/report.pptx",
  "slide_count": 5,
  "slides": [
    { "index": 0, "title": "Q3 Business Review", "layout": "Title Slide" },
    { "index": 1, "title": "Agenda", "layout": "Title and Content" }
  ]
}
```

---

### `list_slides`

List all slides in a presentation with title and a short content preview.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file

**Returns:**
```json
{
  "slide_count": 3,
  "slides": [
    { "index": 0, "title": "Q3 Review", "content_preview": "Agenda · Revenue · Highlights" },
    { "index": 1, "title": "Revenue", "content_preview": "Q1: $1.2M · Q2: $1.5M · Q3: $1.9M" }
  ]
}
```

---

### `add_text_slide`

Add a slide with a title and body text (bullet points or paragraph).

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `title` (string, required) — Slide title
- `content` (string, required) — Body text. Use `\n` to separate bullet points
- `layout` (string, optional) — Slide layout name; defaults to `"Title and Content"`

**Returns:** `{ "slide_index": 2, "title": "Agenda" }`

---

### `add_image_slide`

Add a slide containing a title and an image.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `title` (string, required) — Slide title
- `image_path` (string, required) — Path to the image file (relative to `PPTX_ASSETS_DIR` or absolute). Supported: PNG, JPG, GIF, BMP, TIFF
- `left` (number, optional) — Left position in inches (default: `1.0`)
- `top` (number, optional) — Top position in inches (default: `1.5`)
- `width` (number, optional) — Width in inches (default: `8.0`)
- `height` (number, optional) — Height in inches (default: `5.0`)

**Returns:** `{ "slide_index": 3, "title": "Architecture Diagram" }`

---

### `add_table_slide`

Add a slide containing a title and a data table.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `title` (string, required) — Slide title
- `headers` (array of strings, required) — Column header labels
- `rows` (array of arrays of strings, required) — Table data rows; each inner array must match `headers` length

**Returns:** `{ "slide_index": 4, "title": "Key Metrics", "rows": 5, "columns": 3 }`

---

### `add_chart_slide`

Add a slide containing a title and a chart.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `title` (string, required) — Slide title
- `chart_type` (string, required) — One of: `bar`, `column`, `line`, `pie`, `area`
- `categories` (array of strings, required) — X-axis category labels (e.g. `["Q1", "Q2", "Q3"]`)
- `series` (array of objects, required) — Each object: `{ "name": "Revenue", "values": [1.2, 1.5, 1.9] }`

**Returns:** `{ "slide_index": 5, "title": "Quarterly Revenue", "chart_type": "column" }`

---

### `update_slide_text`

Replace the text of a placeholder on an existing slide.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `slide_index` (number, required) — Zero-based slide index
- `placeholder_index` (number, required) — Zero-based placeholder index (`0` = title, `1` = body, etc.)
- `new_text` (string, required) — Replacement text

**Returns:** `{ "updated": true, "slide_index": 1, "placeholder_index": 0 }`

---

### `delete_slide`

Remove a slide from a presentation by index.

**Parameters:**
- `file_path` (string, required) — Path to the `.pptx` file to modify
- `slide_index` (number, required) — Zero-based index of the slide to delete

**Returns:** `{ "deleted": true, "slide_index": 2, "remaining_slides": 4 }`

---

### `save_presentation`

Save a presentation to a new path (save-as). Use this to rename or export a copy. If `output_path` matches the source, it performs an in-place save (no-op if already persisted by other tools).

**Parameters:**
- `file_path` (string, required) — Path to the source `.pptx` file
- `output_path` (string, required) — Destination path for the saved copy

**Returns:** `{ "saved_to": "/output/final_report.pptx", "slide_count": 6 }`

---

## Example Prompts

### Create a new deck from scratch
```
Create a new presentation at "q3_review.pptx".
Add a title slide "Q3 2024 Business Review" with subtitle "Prepared by Finance".
Add an agenda slide with bullets: Overview, Revenue, Costs, Outlook.
Add a column chart slide "Quarterly Revenue" with categories Q1/Q2/Q3 and
  series Revenue: 1.2, 1.5, 1.9 and Target: 1.0, 1.3, 1.8.
Save it when done.
```

### Update an existing deck
```
Open "board_update.pptx" and list all slides.
Update slide 0 title to "Board Update — October 2024".
Delete slide 3.
Add a new table slide "Headcount" with columns Region/HC/Change and
  rows: EMEA/120/+5, AMER/85/+2, APAC/45/+8.
Save as "board_update_final.pptx".
```

### Add a chart to an existing deck
```
Open "sales_deck.pptx".
Add a line chart slide "Monthly Growth" with categories Jan through Jun
  and series "2023": 10,12,11,14,13,15 and "2024": 12,15,14,18,17,20.
Save in place.
```

### Create from a template
```
Create a new presentation using "corporate_template.pptx" as the base,
output to "project_kickoff.pptx".
Add a title slide "Project Phoenix Kickoff" with subtitle "Engineering All-Hands".
Add a text slide "Goals" with 4 bullet points.
Save it.
```
