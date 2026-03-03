/**
 * PPT Agent — Node.js/TypeScript example
 *
 * Supports creating new PowerPoint presentations using pptxgenjs.
 *
 * NOTE: pptxgenjs is a creation-only library (by maintainer design — see
 * https://github.com/gitbrent/PptxGenJS/issues/912). For updating existing
 * .pptx files, use the Python example (python-pptx has full round-trip support).
 *
 * Requirements:
 *   npm install pptxgenjs
 *
 * Usage:
 *   PPTX_OUTPUT_DIR=./output npx tsx examples/nodejs.ts
 */

import { CopilotClient, defineTool } from "@github/copilot-sdk";
import * as fs from "fs";
import * as path from "path";
import pptxgen from "pptxgenjs";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// In-memory session store
// Each presentation is built up in memory and saved only when requested.
// The agent tracks the session ID across tool calls.
// ---------------------------------------------------------------------------

const sessions = new Map<string, pptxgen>();

function getOrError(sessionId: string): { prs: pptxgen } | { error: string } {
  const prs = sessions.get(sessionId);
  if (!prs) {
    return {
      error: `No active presentation found for session '${sessionId}'. Call create_presentation first.`,
    };
  }
  return { prs };
}

// ---------------------------------------------------------------------------
// Path validation helpers
// ---------------------------------------------------------------------------

function resolveOutputPath(filePath: string): { resolved: string } | { error: string } {
  if (filePath.includes("..")) {
    return { error: "Path traversal is not allowed." };
  }
  if (!filePath.toLowerCase().endsWith(".pptx")) {
    return { error: "Only .pptx files are supported." };
  }

  const outputDir = process.env.PPTX_OUTPUT_DIR ?? process.cwd();
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(outputDir, filePath);

  const outputDirReal = path.resolve(outputDir);
  if (!resolved.startsWith(outputDirReal + path.sep) && resolved !== outputDirReal) {
    return { error: "Access outside of the output directory is not allowed." };
  }

  return { resolved };
}

function resolveAssetPath(assetPath: string): { resolved: string } | { error: string } {
  const SUPPORTED: Set<string> = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif"]);

  if (assetPath.includes("..")) {
    return { error: "Path traversal is not allowed." };
  }

  const ext = path.extname(assetPath).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    return {
      error: `Unsupported image format '${ext}'. Supported: ${[...SUPPORTED].sort().join(", ")}`,
    };
  }

  const assetsDir = process.env.PPTX_ASSETS_DIR ?? process.cwd();
  const resolved = path.isAbsolute(assetPath)
    ? path.resolve(assetPath)
    : path.resolve(assetsDir, assetPath);

  const assetsDirReal = path.resolve(assetsDir);
  if (!resolved.startsWith(assetsDirReal + path.sep)) {
    return { error: "Access outside the assets directory is not allowed." };
  }
  if (!fs.existsSync(resolved)) {
    return { error: `Image file not found: ${assetPath}` };
  }

  return { resolved };
}

const CHART_TYPE_MAP: Record<string, pptxgen.CHART_NAME> = {
  bar: "bar",
  column: "bar",   // pptxgenjs uses "bar" with barDir:"col" for column
  line: "line",
  pie: "pie",
  area: "area",
};

// ---------------------------------------------------------------------------
// Tool: create_presentation
// ---------------------------------------------------------------------------

const createPresentation = defineTool("create_presentation", {
  description: "Create a new in-memory PowerPoint presentation and return a session ID",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: {
        type: "string",
        description: "A unique ID for this presentation session (e.g. 'q3-review')",
      },
      title: {
        type: "string",
        description: "Presentation title (used for metadata)",
      },
    },
    required: ["session_id"],
  },
  handler: async ({
    session_id,
    title = "Untitled Presentation",
  }: {
    session_id: string;
    title?: string;
  }) => {
    if (!session_id.trim()) {
      return { error: "'session_id' must not be empty" };
    }

    const prs = new pptxgen();
    prs.title = title;
    prs.subject = title;
    sessions.set(session_id, prs);

    return {
      session_id,
      title,
      note: "Presentation created in memory. Use add_*_slide tools to add content, then save_presentation to write the file.",
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: add_text_slide
// ---------------------------------------------------------------------------

const addTextSlide = defineTool("add_text_slide", {
  description: "Add a slide with a title and body text (bullet points) to the presentation",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: { type: "string", description: "Presentation session ID" },
      title: { type: "string", description: "Slide title" },
      content: {
        type: "string",
        description: "Body text. Use \\n to separate bullet points",
      },
      title_font_size: {
        type: "number",
        description: "Title font size in points (default: 28)",
      },
      body_font_size: {
        type: "number",
        description: "Body font size in points (default: 18)",
      },
    },
    required: ["session_id", "title", "content"],
  },
  handler: async ({
    session_id,
    title,
    content,
    title_font_size = 28,
    body_font_size = 18,
  }: {
    session_id: string;
    title: string;
    content: string;
    title_font_size?: number;
    body_font_size?: number;
  }) => {
    const result = getOrError(session_id);
    if ("error" in result) return result;
    const { prs } = result;

    if (title_font_size <= 0 || body_font_size <= 0) {
      return { error: "Font sizes must be greater than 0" };
    }

    const slide = prs.addSlide();

    // Title
    slide.addText(title, {
      x: 0.5, y: 0.3, w: 9.0, h: 0.8,
      fontSize: title_font_size,
      bold: true,
      color: "1F497D",
    });

    // Body bullets
    const lines = content.split("\n").filter((l) => l.trim());
    const bulletObjects = lines.map((line) => ({
      text: line,
      options: { bullet: true, fontSize: body_font_size, color: "363636" },
    }));

    if (bulletObjects.length > 0) {
      slide.addText(bulletObjects, { x: 0.5, y: 1.3, w: 9.0, h: 5.5 });
    }

    const slideCount = (prs as any).slides?.length ?? "unknown";
    return { session_id, title, note: `Text slide added (slide ~${slideCount})` };
  },
});

// ---------------------------------------------------------------------------
// Tool: add_image_slide
// ---------------------------------------------------------------------------

const addImageSlide = defineTool("add_image_slide", {
  description: "Add a slide with a title and an image",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: { type: "string", description: "Presentation session ID" },
      title: { type: "string", description: "Slide title" },
      image_path: {
        type: "string",
        description: "Path to the image file (relative to PPTX_ASSETS_DIR or absolute)",
      },
      left: { type: "number", description: "Left position in inches (default: 1.0)" },
      top: { type: "number", description: "Top position in inches (default: 1.5)" },
      width: { type: "number", description: "Width in inches (default: 8.0)" },
      height: { type: "number", description: "Height in inches (default: 5.0)" },
    },
    required: ["session_id", "title", "image_path"],
  },
  handler: async ({
    session_id,
    title,
    image_path,
    left = 1.0,
    top = 1.5,
    width = 8.0,
    height = 5.0,
  }: {
    session_id: string;
    title: string;
    image_path: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => {
    const result = getOrError(session_id);
    if ("error" in result) return result;
    const { prs } = result;

    const assetResult = resolveAssetPath(image_path);
    if ("error" in assetResult) return assetResult;

    if (left < 0 || top < 0) return { error: "'left' and 'top' must be non-negative" };
    if (width <= 0 || height <= 0) return { error: "'width' and 'height' must be greater than 0" };

    const slide = prs.addSlide();

    slide.addText(title, {
      x: 0.5, y: 0.2, w: 9.0, h: 0.8,
      fontSize: 28,
      bold: true,
      color: "1F497D",
    });

    slide.addImage({ path: assetResult.resolved, x: left, y: top, w: width, h: height });

    return { session_id, title, note: "Image slide added" };
  },
});

// ---------------------------------------------------------------------------
// Tool: add_table_slide
// ---------------------------------------------------------------------------

const addTableSlide = defineTool("add_table_slide", {
  description: "Add a slide with a title and a data table",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: { type: "string", description: "Presentation session ID" },
      title: { type: "string", description: "Slide title" },
      headers: {
        type: "array",
        items: { type: "string" },
        description: "Column header labels",
      },
      rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
        description: "Table data rows (each inner array must match headers length)",
      },
    },
    required: ["session_id", "title", "headers", "rows"],
  },
  handler: async ({
    session_id,
    title,
    headers,
    rows,
  }: {
    session_id: string;
    title: string;
    headers: string[];
    rows: string[][];
  }) => {
    const result = getOrError(session_id);
    if ("error" in result) return result;
    const { prs } = result;

    if (!headers.length) return { error: "'headers' must not be empty" };
    if (!rows.length) return { error: "'rows' must not be empty" };
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length !== headers.length) {
        return {
          error: `Row ${i} has ${rows[i].length} values but expected ${headers.length} (matching headers)`,
        };
      }
    }

    const slide = prs.addSlide();

    slide.addText(title, {
      x: 0.5, y: 0.2, w: 9.0, h: 0.8,
      fontSize: 28,
      bold: true,
      color: "1F497D",
    });

    // Build pptxgenjs table rows
    const headerRow: pptxgen.TableCell[] = headers.map((h) => ({
      text: h,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: "1F497D" },
        fontSize: 12,
      },
    }));

    const dataRows: pptxgen.TableCell[][] = rows.map((row, rowIdx) =>
      row.map((cell) => ({
        text: cell,
        options: {
          fontSize: 11,
          fill: { color: rowIdx % 2 === 1 ? "DDE8F5" : "FFFFFF" },
        },
      }))
    );

    slide.addTable([headerRow, ...dataRows], {
      x: 0.5,
      y: 1.3,
      w: 9.0,
      border: { type: "solid", color: "CCCCCC", pt: 0.5 },
    });

    return {
      session_id,
      title,
      rows: rows.length,
      columns: headers.length,
      note: "Table slide added",
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: add_chart_slide
// ---------------------------------------------------------------------------

const addChartSlide = defineTool("add_chart_slide", {
  description: "Add a slide with a title and a chart (bar, column, line, pie, or area)",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: { type: "string", description: "Presentation session ID" },
      title: { type: "string", description: "Slide title" },
      chart_type: {
        type: "string",
        description: "Chart type: bar, column, line, pie, or area",
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "X-axis category labels",
      },
      series: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            values: { type: "array", items: { type: "number" } },
          },
          required: ["name", "values"],
        },
        description: "One or more data series",
      },
    },
    required: ["session_id", "title", "chart_type", "categories", "series"],
  },
  handler: async ({
    session_id,
    title,
    chart_type,
    categories,
    series,
  }: {
    session_id: string;
    title: string;
    chart_type: string;
    categories: string[];
    series: Array<{ name: string; values: number[] }>;
  }) => {
    const result = getOrError(session_id);
    if ("error" in result) return result;
    const { prs } = result;

    const chartKey = chart_type.toLowerCase();
    if (!(chartKey in CHART_TYPE_MAP)) {
      return {
        error: `Unsupported chart type '${chart_type}'. Supported: ${Object.keys(CHART_TYPE_MAP).join(", ")}`,
      };
    }
    if (!categories.length) return { error: "'categories' must not be empty" };
    if (!series.length) return { error: "'series' must not be empty" };
    for (const s of series) {
      if (s.values.length !== categories.length) {
        return {
          error: `Series '${s.name}' has ${s.values.length} values but expected ${categories.length} (matching categories)`,
        };
      }
    }

    const slide = prs.addSlide();

    slide.addText(title, {
      x: 0.5, y: 0.2, w: 9.0, h: 0.8,
      fontSize: 28,
      bold: true,
      color: "1F497D",
    });

    const chartData: pptxgen.IChartData[] = series.map((s) => ({
      name: s.name,
      labels: categories,
      values: s.values,
    }));

    const chartOpts: pptxgen.IChartOpts = {
      x: 0.5, y: 1.3, w: 9.0, h: 5.5,
      showLegend: series.length > 1,
      showTitle: false,
    };

    // Column charts use "bar" type with barDir:"col" in pptxgenjs
    if (chartKey === "column") {
      (chartOpts as any).barDir = "col";
    }

    slide.addChart(CHART_TYPE_MAP[chartKey], chartData, chartOpts);

    return { session_id, title, chart_type, note: "Chart slide added" };
  },
});

// ---------------------------------------------------------------------------
// Tool: save_presentation
// ---------------------------------------------------------------------------

const savePresentation = defineTool("save_presentation", {
  description: "Write the in-memory presentation to a .pptx file",
  parameters: {
    type: "object" as const,
    properties: {
      session_id: { type: "string", description: "Presentation session ID" },
      output_path: {
        type: "string",
        description: "Destination .pptx file path (relative to PPTX_OUTPUT_DIR or absolute)",
      },
    },
    required: ["session_id", "output_path"],
  },
  handler: async ({
    session_id,
    output_path,
  }: {
    session_id: string;
    output_path: string;
  }) => {
    const result = getOrError(session_id);
    if ("error" in result) return result;
    const { prs } = result;

    const pathResult = resolveOutputPath(output_path);
    if ("error" in pathResult) return pathResult;

    const dir = path.dirname(pathResult.resolved);
    if (dir) fs.mkdirSync(dir, { recursive: true });

    try {
      await prs.writeFile({ fileName: pathResult.resolved });
      return { saved_to: pathResult.resolved, session_id };
    } catch (err) {
      return { error: String(err) };
    }
  },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allTools = [
  createPresentation,
  addTextSlide,
  addImageSlide,
  addTableSlide,
  addChartSlide,
  savePresentation,
];

const client = new CopilotClient();
await client.start();

const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
  systemMessage: {
    content: [
      "You are an expert PowerPoint presentation author (creation mode).",
      "Use create_presentation to start a new deck and get a session_id.",
      "Use that session_id in all subsequent add_*_slide calls.",
      "Call save_presentation at the end to write the .pptx file.",
      "Report each action taken and confirm the final saved file path.",
      "NOTE: This Node.js implementation creates new presentations only.",
      "To open and modify existing .pptx files, use the Python example instead.",
    ].join(" "),
  },
  tools: allTools,
});

session.on("assistant.message_delta", (event: any) => {
  process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => {
  process.stdout.write("\n\n");
});

const outputDir = process.env.PPTX_OUTPUT_DIR ?? process.cwd();
console.log("PowerPoint Agent — Node.js / pptxgenjs (create-only)");
console.log(`Output directory: ${outputDir}`);
console.log("Type 'exit' to quit.\n");
console.log(
  "Try: \"Create a 3-slide presentation, session ID 'demo', with a title slide, " +
  "agenda, and summary. Save as demo.pptx\"\n"
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const prompt = () => {
  rl.question("You: ", async (input: string) => {
    const trimmed = input.trim();
    if (trimmed.toLowerCase() === "exit") {
      await client.stop();
      rl.close();
      return;
    }
    if (!trimmed) {
      prompt();
      return;
    }
    process.stdout.write("Agent: ");
    await session.sendAndWait({ prompt: trimmed });
    prompt();
  });
};

prompt();
