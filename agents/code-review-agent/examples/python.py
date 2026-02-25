"""
Code Review Agent — Python example

Usage:
    REVIEW_OWNER=owner REVIEW_REPO=repo REVIEW_PR_NUMBER=42 uv run python python.py
"""
import asyncio
import os
import sys

import httpx
from pydantic import BaseModel, Field

from copilot import CopilotClient
from copilot.generated.session_events import SessionEventType
from copilot.tools import define_tool


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

class FetchDiffParams(BaseModel):
    owner: str = Field(description="Repository owner")
    repo: str = Field(description="Repository name")
    pr_number: int = Field(description="Pull request number")


class PostCommentParams(BaseModel):
    owner: str
    repo: str
    pr_number: int
    commit_id: str = Field(description="Latest commit SHA on the PR")
    path: str = Field(description="File path relative to repo root")
    line: int = Field(description="Line number in the diff")
    body: str = Field(description="Comment text (supports Markdown)")


@define_tool(description="Fetch the unified diff for a pull request")
async def fetch_diff(params: FetchDiffParams) -> dict:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN", "")
    headers = {"Accept": "application/vnd.github.v3.diff"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient() as http:
        response = await http.get(
            f"https://api.github.com/repos/{params.owner}/{params.repo}/pulls/{params.pr_number}",
            headers=headers,
        )

    if response.status_code != 200:
        return {"error": f"GitHub API error: {response.status_code}"}
    return {"diff": response.text}


@define_tool(description="Post an inline review comment on a specific line of a PR")
async def post_review_comment(params: PostCommentParams) -> dict:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "body": params.body,
        "commit_id": params.commit_id,
        "path": params.path,
        "line": params.line,
        "side": "RIGHT",
    }
    async with httpx.AsyncClient() as http:
        response = await http.post(
            f"https://api.github.com/repos/{params.owner}/{params.repo}/pulls/{params.pr_number}/comments",
            headers=headers,
            json=payload,
        )
    if response.status_code not in (200, 201):
        return {"error": f"GitHub API error: {response.status_code}"}
    data = response.json()
    return {"comment_id": data["id"], "url": data["html_url"]}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

OWNER = os.environ.get("REVIEW_OWNER", "owner")
REPO = os.environ.get("REVIEW_REPO", "repo")
PR_NUMBER = int(os.environ.get("REVIEW_PR_NUMBER", "1"))


async def main() -> None:
    client = CopilotClient()
    await client.start()

    session = await client.create_session({
        "model": "gpt-4.1",
        "streaming": True,
        "system_message": {
            "content": (
                "You are a senior software engineer conducting a thorough code review. "
                "Identify security vulnerabilities, logic errors, and performance anti-patterns. "
                "Be constructive and specific. Reference file paths and line numbers. "
                "Return your findings as JSON: "
                "{ summary, approved, findings: [{ severity, file, line, message, suggestion }] }"
            )
        },
        "tools": [fetch_diff, post_review_comment],
    })

    def handle_event(event) -> None:
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()
        if event.type == SessionEventType.SESSION_IDLE:
            print()

    session.on(handle_event)

    await session.send_and_wait({
        "prompt": (
            f"Review PR #{PR_NUMBER} in {OWNER}/{REPO}. "
            "Fetch the diff and return a structured review."
        )
    })

    await client.stop()


asyncio.run(main())
