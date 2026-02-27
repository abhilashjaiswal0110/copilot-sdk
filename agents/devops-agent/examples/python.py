"""
DevOps / SRE Agent — Python example

Usage:
    KUBECONFIG=~/.kube/config uv run python python.py
    # Works without a cluster — kubectl errors are surfaced as tool results
"""
import asyncio
import re
import subprocess
import sys

from pydantic import BaseModel, Field

from copilot import CopilotClient
from copilot.generated.session_events import SessionEventType
from copilot.tools import define_tool

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

# Kubernetes name pattern: lowercase alphanumeric and hyphens only
_K8S_NAME = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
# Duration pattern for --since flag: e.g. 1h, 30m, 2h
_DURATION = re.compile(r"^[0-9]+(h|m|s)$")

_ALLOWED_KUBECTL = {"get", "describe", "logs", "top", "rollout"}


def _validate_k8s_name(value: str, label: str) -> str | None:
    """Return an error string if *value* is not a valid Kubernetes name."""
    if not _K8S_NAME.match(value):
        return f"Invalid {label}. Use lowercase alphanumeric characters and hyphens only."
    return None


# ---------------------------------------------------------------------------
# Tool: run read-only kubectl commands
# ---------------------------------------------------------------------------


class KubectlParams(BaseModel):
    command: str = Field(description="kubectl arguments, e.g. 'get pods -n production'")


@define_tool(description="Execute a read-only kubectl command to inspect cluster state")
def run_kubectl(params: KubectlParams) -> dict:
    args = params.command.strip().split()
    if not args:
        return {"error": "No command provided"}
    subcommand = args[0]
    if subcommand not in _ALLOWED_KUBECTL:
        return {
            "error": (
                f"Only read-only kubectl commands are permitted. "
                f"Allowed: {', '.join(sorted(_ALLOWED_KUBECTL))}"
            )
        }
    try:
        result = subprocess.run(
            ["kubectl", *args],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {"output": result.stdout, "stderr": result.stderr}
    except FileNotFoundError:
        return {"error": "kubectl not found. Install kubectl and ensure it is in your PATH."}
    except subprocess.TimeoutExpired:
        return {"error": "kubectl command timed out after 30 seconds."}


# ---------------------------------------------------------------------------
# Tool: fetch application logs
# ---------------------------------------------------------------------------


class FetchLogsParams(BaseModel):
    service: str = Field(description="App label selector value")
    namespace: str = Field(default="production")
    lines: int = Field(default=100)
    since: str = Field(default="1h", description="Duration, e.g. 1h, 30m")


@define_tool(description="Fetch recent logs for a service")
def fetch_logs(params: FetchLogsParams) -> dict:
    err = _validate_k8s_name(params.service, "service name")
    if err:
        return {"error": err}
    err = _validate_k8s_name(params.namespace, "namespace")
    if err:
        return {"error": err}
    if not _DURATION.match(params.since):
        return {"error": "Invalid duration format. Use a value like 1h, 30m, or 2h."}
    safe_lines = max(1, min(1000, params.lines))
    try:
        result = subprocess.run(
            [
                "kubectl", "logs", "-l", f"app={params.service}",
                "-n", params.namespace,
                f"--tail={safe_lines}",
                f"--since={params.since}",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {"logs": result.stdout, "stderr": result.stderr}
    except FileNotFoundError:
        return {"error": "kubectl not found. Install kubectl and ensure it is in your PATH."}
    except subprocess.TimeoutExpired:
        return {"error": "kubectl command timed out."}


# ---------------------------------------------------------------------------
# Tool: list recent deployments
# ---------------------------------------------------------------------------


class ListDeploymentsParams(BaseModel):
    namespace: str = Field(default="production")


@define_tool(description="List recent deployment events in a namespace")
def list_recent_deployments(params: ListDeploymentsParams) -> dict:
    import json

    err = _validate_k8s_name(params.namespace, "namespace")
    if err:
        return {"error": err}
    try:
        result = subprocess.run(
            ["kubectl", "get", "deployments", "-n", params.namespace, "-o", "json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return {"error": result.stderr or "kubectl returned non-zero exit code"}
        data = json.loads(result.stdout)
        deployments = [
            {
                "name": d["metadata"]["name"],
                "image": (
                    d["spec"]["template"]["spec"]["containers"][0].get("image", "unknown")
                    if d["spec"]["template"]["spec"]["containers"]
                    else "unknown"
                ),
                "timestamp": d["metadata"]["creationTimestamp"],
                "ready": (
                    f"{d['status'].get('readyReplicas', 0)}/{d['status'].get('replicas', 0)}"
                ),
            }
            for d in data.get("items", [])
        ]
        return {"deployments": deployments}
    except FileNotFoundError:
        return {"error": "kubectl not found. Install kubectl and ensure it is in your PATH."}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError) as exc:
        return {"error": str(exc)}


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
                "You are a senior SRE assistant. "
                "Help with incident response, infrastructure health checks, and deployment analysis. "
                "Only run read-only kubectl commands. Always confirm the environment before acting. "
                "Summarize all findings clearly and suggest next investigation steps."
            )
        },
        "tools": [run_kubectl, fetch_logs, list_recent_deployments],
    })

    def handle_event(event) -> None:
        if event.type == SessionEventType.ASSISTANT_MESSAGE_DELTA:
            sys.stdout.write(event.data.delta_content)
            sys.stdout.flush()
        if event.type == SessionEventType.SESSION_IDLE:
            sys.stdout.write("\n\n")
            sys.stdout.flush()

    session.on(handle_event)

    print("🔧 DevOps Agent (type 'exit' to quit)\n")
    print("   Try: 'Check the health of api-gateway in production'\n")

    while True:
        try:
            user_input = input("Engineer: ").strip()
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
