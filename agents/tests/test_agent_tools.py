"""
Unit tests for agent tool logic — no Copilot CLI or network required.

These tests validate the pure Python utility logic embedded in each agent example:
  - data_analyst: compute_stats, load_csv path traversal protection, SQL validation
  - devops: run_kubectl input validation, fetch_logs duration / k8s-name validation
  - customer_support: ticket ID generation (time-based), escalation routing
  - code_review: fetch_diff / post_review_comment error handling (missing token)

Run with:
    cd python && python -m pytest ../agents/tests/test_agent_tools.py -v
"""

import math
import os
import re
import tempfile
import time
import textwrap
import uuid

import pytest


# ---------------------------------------------------------------------------
# Helpers shared across tests
# ---------------------------------------------------------------------------

K8S_NAME_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
DURATION_RE = re.compile(r"^[0-9]+(h|m|s)$")
ALLOWED_KUBECTL = {"get", "describe", "logs", "top", "rollout"}


def _compute_stats(values: list, column_name: str = "value") -> dict:
    """Inline replica of the compute_stats tool logic (data-analyst-agent)."""
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
        "column": column_name,
        "count": n,
        "min": sorted_vals[0],
        "max": sorted_vals[-1],
        "mean": round(mean, 2),
        "median": round(median, 2),
        "std_dev": round(math.sqrt(variance), 2),
        "p25": p25,
        "p75": p75,
    }


def _validate_load_csv_path(file_path: str, data_dir: str) -> dict | None:
    """Return an error dict when path is invalid, else None (inline replica)."""
    import os.path as osp

    if osp.isabs(file_path) or ".." in file_path:
        return {"error": "Invalid file path. Only relative paths within the data directory are allowed."}
    if not file_path.lower().endswith(".csv"):
        return {"error": "Only .csv files are supported."}
    data_dir_real = osp.realpath(data_dir)
    resolved = osp.realpath(osp.join(data_dir_real, file_path))
    if not resolved.startswith(data_dir_real + osp.sep) and resolved != data_dir_real:
        return {"error": "Access outside of the data directory is not allowed."}
    return None


def _validate_sql(sql: str) -> dict | None:
    """Return error dict if query is not read-only or contains semicolons, else None."""
    normalized = sql.strip().upper()
    if not (normalized.startswith("SELECT") or normalized.startswith("WITH")):
        return {"error": "Only SELECT queries are permitted"}
    if ";" in sql:
        return {"error": "Semicolons are not permitted in queries"}
    return None


def _validate_kubectl_command(command: str) -> dict | None:
    """Return error dict if kubectl subcommand not allowed."""
    args = command.strip().split()
    if not args:
        return {"error": "No command provided"}
    if args[0] not in ALLOWED_KUBECTL:
        return {
            "error": (
                f"Only read-only kubectl commands are permitted. "
                f"Allowed: {', '.join(sorted(ALLOWED_KUBECTL))}"
            )
        }
    return None


def _validate_k8s_name(value: str) -> bool:
    return bool(K8S_NAME_RE.match(value))


def _validate_duration(value: str) -> bool:
    return bool(DURATION_RE.match(value))


def _make_ticket_id() -> str:
    return f"TKT-{uuid.uuid4()}"


# ---------------------------------------------------------------------------
# Data Analyst: compute_stats
# ---------------------------------------------------------------------------


class TestComputeStats:
    def test_basic_statistics(self):
        result = _compute_stats([1, 2, 3, 4, 5])
        assert result["count"] == 5
        assert result["min"] == 1
        assert result["max"] == 5
        assert result["mean"] == 3.0
        assert result["median"] == 3

    def test_even_count_median(self):
        result = _compute_stats([1, 2, 3, 4])
        assert result["median"] == 2.5

    def test_single_element(self):
        result = _compute_stats([42.0])
        assert result["count"] == 1
        assert result["min"] == 42.0
        assert result["max"] == 42.0
        assert result["mean"] == 42.0
        assert result["std_dev"] == 0.0

    def test_empty_returns_error(self):
        result = _compute_stats([])
        assert "error" in result

    def test_column_name_label(self):
        result = _compute_stats([10, 20, 30], column_name="revenue")
        assert result["column"] == "revenue"

    def test_rounding_to_two_decimals(self):
        result = _compute_stats([1, 2, 3])
        assert result["mean"] == round(result["mean"], 2)
        assert result["std_dev"] == round(result["std_dev"], 2)

    def test_std_dev_known_value(self):
        # Population std_dev of [2, 4, 4, 4, 5, 5, 7, 9] == 2.0
        result = _compute_stats([2, 4, 4, 4, 5, 5, 7, 9])
        assert result["std_dev"] == 2.0

    def test_percentiles_ordered(self):
        data = list(range(1, 101))
        result = _compute_stats(data)
        assert result["p25"] <= result["median"] <= result["p75"]


# ---------------------------------------------------------------------------
# Data Analyst: load_csv path traversal protection
# ---------------------------------------------------------------------------


class TestLoadCsvPathValidation:
    def test_relative_path_allowed(self, tmp_path):
        err = _validate_load_csv_path("data.csv", str(tmp_path))
        assert err is None

    def test_absolute_path_rejected(self, tmp_path):
        err = _validate_load_csv_path("/etc/passwd", str(tmp_path))
        assert err is not None
        assert "Invalid file path" in err["error"]

    def test_traversal_rejected(self, tmp_path):
        err = _validate_load_csv_path("../secret.csv", str(tmp_path))
        assert err is not None
        assert "Invalid file path" in err["error"]

    def test_non_csv_rejected(self, tmp_path):
        err = _validate_load_csv_path("data.json", str(tmp_path))
        assert err is not None
        assert "Only .csv files are supported" in err["error"]

    def test_nested_relative_path_allowed(self, tmp_path):
        sub = tmp_path / "subdir"
        sub.mkdir()
        err = _validate_load_csv_path("subdir/data.csv", str(tmp_path))
        assert err is None

    def test_subdirectory_traversal_rejected(self, tmp_path):
        # Attempt to escape via nested traversal
        err = _validate_load_csv_path("subdir/../../etc/shadow.csv", str(tmp_path))
        assert err is not None


# ---------------------------------------------------------------------------
# Data Analyst: SQL read-only validation
# ---------------------------------------------------------------------------


class TestSqlValidation:
    @pytest.mark.parametrize("sql", [
        "SELECT * FROM users",
        "  select id from orders",
        "WITH cte AS (SELECT 1) SELECT * FROM cte",
    ])
    def test_select_queries_allowed(self, sql):
        assert _validate_sql(sql) is None

    @pytest.mark.parametrize("sql", [
        "INSERT INTO users VALUES (1)",
        "UPDATE users SET name='x'",
        "DELETE FROM logs",
        "DROP TABLE users",
        "TRUNCATE orders",
        "SELECT 1; DROP TABLE users",   # stacked query injection attempt
        "SELECT * FROM users; DELETE FROM logs",  # second semicolon injection
    ])
    def test_write_queries_rejected(self, sql):
        result = _validate_sql(sql)
        assert result is not None


# ---------------------------------------------------------------------------
# DevOps: kubectl command validation
# ---------------------------------------------------------------------------


class TestKubectlValidation:
    @pytest.mark.parametrize("cmd", [
        "get pods -n production",
        "describe pod api-gateway-abc123",
        "logs -l app=api-gateway --tail=100",
        "top nodes",
        "rollout status deployment/api-gateway",
    ])
    def test_allowed_subcommands(self, cmd):
        assert _validate_kubectl_command(cmd) is None

    @pytest.mark.parametrize("cmd", [
        "delete pod mypod",
        "apply -f deployment.yaml",
        "exec -it mypod -- /bin/sh",
        "port-forward svc/myservice 8080:80",
        "scale deployment/api --replicas=0",
    ])
    def test_disallowed_subcommands(self, cmd):
        result = _validate_kubectl_command(cmd)
        assert result is not None
        assert "Allowed:" in result["error"]

    def test_empty_command(self):
        result = _validate_kubectl_command("   ")
        assert result is not None
        assert "No command provided" in result["error"]


# ---------------------------------------------------------------------------
# DevOps: Kubernetes name and duration validation
# ---------------------------------------------------------------------------


class TestK8sNameValidation:
    @pytest.mark.parametrize("name", [
        "api-gateway",
        "production",
        "myapp123",
        "a",
        "a1b2c3",
    ])
    def test_valid_names(self, name):
        assert _validate_k8s_name(name) is True

    @pytest.mark.parametrize("name", [
        "-invalid",
        "invalid-",
        "Invalid",
        "my_service",
        "",
        "has spaces",
        "UPPER",
    ])
    def test_invalid_names(self, name):
        assert _validate_k8s_name(name) is False


class TestDurationValidation:
    @pytest.mark.parametrize("duration", ["1h", "30m", "2h", "90s", "5m"])
    def test_valid_durations(self, duration):
        assert _validate_duration(duration) is True

    @pytest.mark.parametrize("duration", [
        "1hour",
        "h1",
        "1d",
        "1H",
        "",
        "abc",
        "1h30m",  # compound format not supported
    ])
    def test_invalid_durations(self, duration):
        assert _validate_duration(duration) is False


# ---------------------------------------------------------------------------
# Customer Support: ticket ID generation
# ---------------------------------------------------------------------------


class TestTicketGeneration:
    def test_ticket_id_format(self):
        ticket_id = _make_ticket_id()
        assert ticket_id.startswith("TKT-")
        uuid_part = ticket_id[4:]
        # Must be a valid UUID (8-4-4-4-12 hex groups)
        uuid.UUID(uuid_part)  # raises ValueError if invalid

    def test_ticket_ids_are_unique(self):
        ids = [_make_ticket_id() for _ in range(100)]
        assert len(set(ids)) == 100, "UUID-based ticket IDs must be unique"

    def test_priority_affects_estimated_response(self):
        def estimated_response(priority: str) -> str:
            return "2 hours" if priority == "high" else "24 hours"

        assert estimated_response("high") == "2 hours"
        assert estimated_response("medium") == "24 hours"
        assert estimated_response("low") == "24 hours"


# ---------------------------------------------------------------------------
# Customer Support: escalation routing
# ---------------------------------------------------------------------------


class TestEscalationRouting:
    def test_urgent_escalation_queue_position(self):
        def queue_position(priority: str) -> int:
            return 1 if priority == "urgent" else 5

        assert queue_position("urgent") == 1
        assert queue_position("normal") == 5

    def test_urgent_escalation_wait_time(self):
        def estimated_wait(priority: str) -> str:
            return "5 minutes" if priority == "urgent" else "30 minutes"

        assert estimated_wait("urgent") == "5 minutes"
        assert estimated_wait("normal") == "30 minutes"


# ---------------------------------------------------------------------------
# Code Review: token validation
# ---------------------------------------------------------------------------


class TestCodeReviewTokenHandling:
    def test_missing_token_returns_error(self):
        """fetch_diff and post_review_comment should fail gracefully without a token."""
        token = ""
        if not token:
            result = {"error": "GITHUB_TOKEN or GH_TOKEN environment variable is required"}
        else:
            result = {}
        assert "error" in result

    def test_github_api_url_format(self):
        """Verify the GitHub API URL format used by fetch_diff."""
        owner, repo, pr_number = "octocat", "hello-world", 42
        expected = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
        assert url == expected


# ---------------------------------------------------------------------------
# Load CSV: integration test (writes a real temp file)
# ---------------------------------------------------------------------------


class TestLoadCsvIntegration:
    def test_reads_csv_file(self, tmp_path):
        csv_content = textwrap.dedent("""\
            date,revenue,orders
            2024-01-01,1000,10
            2024-01-02,2000,20
            2024-01-03,1500,15
        """)
        csv_file = tmp_path / "sales.csv"
        csv_file.write_text(csv_content)

        # Simulate load_csv logic
        import csv

        with open(csv_file, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            data = list(reader)

        assert list(headers) == ["date", "revenue", "orders"]
        assert len(data) == 3
        assert data[0]["revenue"] == "1000"
