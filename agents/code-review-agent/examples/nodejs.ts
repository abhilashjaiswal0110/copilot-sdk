import { CopilotClient, defineTool } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Tool: fetch the unified diff for a pull request
// ---------------------------------------------------------------------------
const fetchDiff = defineTool("fetch_diff", {
    description: "Fetch the unified diff for a pull request",
    parameters: {
        type: "object",
        properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pr_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pr_number"],
    },
    handler: async ({ owner, repo, pr_number }) => {
        const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${pr_number}`,
            {
                headers: {
                    Accept: "application/vnd.github.v3.diff",
                    Authorization: token ? `Bearer ${token}` : "",
                },
            }
        );
        if (!response.ok) {
            return { error: `GitHub API error: ${response.status} ${response.statusText}` };
        }
        return { diff: await response.text() };
    },
});

// ---------------------------------------------------------------------------
// Tool: post an inline review comment (optional)
// ---------------------------------------------------------------------------
const postReviewComment = defineTool("post_review_comment", {
    description: "Post an inline review comment on a specific line of a PR",
    parameters: {
        type: "object",
        properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            pr_number: { type: "number" },
            commit_id: { type: "string", description: "Latest commit SHA on the PR" },
            path: { type: "string", description: "File path relative to repo root" },
            line: { type: "number", description: "Line number in the diff" },
            body: { type: "string", description: "Comment text (supports Markdown)" },
        },
        required: ["owner", "repo", "pr_number", "commit_id", "path", "line", "body"],
    },
    handler: async ({ owner, repo, pr_number, commit_id, path, line, body }) => {
        const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${pr_number}/comments`,
            {
                method: "POST",
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ body, commit_id, path, line, side: "RIGHT" }),
            }
        );
        if (!response.ok) {
            return { error: `GitHub API error: ${response.status}` };
        }
        const data = (await response.json()) as { id: number; html_url: string };
        return { comment_id: data.id, url: data.html_url };
    },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const OWNER = process.env.REVIEW_OWNER ?? "owner";
const REPO = process.env.REVIEW_REPO ?? "repo";
const PR_NUMBER = parseInt(process.env.REVIEW_PR_NUMBER ?? "1", 10);

const client = new CopilotClient();
const session = await client.createSession({
    model: "gpt-4.1",
    systemMessage: {
        content: `You are a senior software engineer conducting a thorough code review.
Identify security vulnerabilities, logic errors, and performance anti-patterns.
Be constructive and specific. Reference file paths and line numbers.
Return your findings as JSON: { summary, approved, findings: [{ severity, file, line, message, suggestion }] }`,
    },
    tools: [fetchDiff, postReviewComment],
});

session.on("assistant.message_delta", (event) => {
    process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => console.log());

await session.sendAndWait({
    prompt: `Review PR #${PR_NUMBER} in ${OWNER}/${REPO}. Fetch the diff and return a structured review.`,
});

await client.stop();
process.exit(0);
