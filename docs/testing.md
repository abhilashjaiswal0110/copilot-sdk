# Testing Guide

This guide covers how to run, write, and extend tests for the GitHub Copilot SDK across all supported languages.

## Overview

The SDK uses a **replay-based E2E test harness** that records and replays real Copilot API interactions, enabling fast, deterministic tests without requiring live API calls during development.

```
Test Code
    ↓
SDK Client
    ↓ JSON-RPC
Replay Proxy (test/harness/server.ts)
    ↓ Replays from YAML snapshots
test/snapshots/*.yml
```

---

## Running Tests

### All SDKs

```bash
# From the repo root (requires just)
just test
```

### Individual SDKs

```bash
# Node.js / TypeScript
just test-nodejs
# or: cd nodejs && npm test

# Python
just test-python
# or: cd python && uv run pytest

# Go
just test-go
# or: cd go && go test ./...

# .NET
just test-dotnet
# or: cd dotnet && dotnet test test/GitHub.Copilot.SDK.Test.csproj
```

---

## Test Architecture

### Replay Proxy

The test harness lives in `test/harness/`. It starts an HTTP server that intercepts JSON-RPC calls from SDK clients and replays pre-recorded responses from YAML snapshot files.

- **Harness source:** `test/harness/server.ts`
- **Python wrapper:** `python/e2e/testharness/proxy.py`
- **Snapshots:** `test/snapshots/`

The harness prints `Listening: http://...` to stdout; E2E test suites parse this URL to configure the CLI or proxy.

### YAML Snapshots

Each YAML file in `test/snapshots/` represents a recorded conversation exchange. These are used for deterministic replay.

```yaml
# Example snapshot structure
- request:
    method: session/send
    params:
      prompt: "What is 2 + 2?"
  response:
    data:
      content: "4"
```

---

## Node.js / TypeScript Tests

### Test Runner

The Node.js SDK uses [Vitest](https://vitest.dev/).

```bash
cd nodejs
npm test           # Run all tests
npm run test:watch # Watch mode
```

### Test Location

```
nodejs/
  test/
    *.test.ts      # Unit and integration tests
```

### Writing a New Test

```typescript
import { describe, it, expect } from "vitest";
import { CopilotClient } from "../src/client";

describe("CopilotClient", () => {
  it("should create a session and receive a response", async () => {
    const client = new CopilotClient({ cliUrl: process.env.TEST_CLI_URL });
    const session = await client.createSession({ model: "gpt-4.1" });
    const response = await session.sendAndWait({ prompt: "Say hello" });
    expect(response?.data.content).toBeDefined();
    await client.stop();
  });
});
```

---

## Python Tests

### Test Runner

The Python SDK uses [pytest](https://pytest.org/).

```bash
cd python
uv run pytest                    # Run all tests
uv run pytest -v                 # Verbose output
uv run pytest tests/test_client.py  # Run a specific file
uv run pytest -k "test_session"  # Run tests matching a pattern
```

### Test Location

```
python/
  tests/           # Unit tests
  e2e/             # End-to-end tests using the replay harness
    testharness/
      proxy.py     # Wraps the Node.js test harness
```

### Writing a New Test

```python
import pytest
import asyncio
from copilot import CopilotClient

@pytest.mark.asyncio
async def test_session_sends_message(cli_url):
    client = CopilotClient({"cli_url": cli_url})
    await client.start()

    session = await client.create_session({"model": "gpt-4.1"})
    response = await session.send_and_wait({"prompt": "Say hello"})

    assert response.data.content is not None
    await client.stop()
```

---

## Go Tests

### Test Runner

The Go SDK uses the standard `go test` framework.

```bash
cd go
go test ./...           # Run all tests
go test -v ./...        # Verbose output
go test -run TestSession ./...  # Run specific tests
```

### Test Location

```
go/
  *_test.go           # Tests alongside source files
```

### Writing a New Test

```go
package copilot_test

import (
    "context"
    "os"
    "testing"

    copilot "github.com/github/copilot-sdk/go"
)

func TestSessionSendsMessage(t *testing.T) {
    ctx := context.Background()
    client := copilot.NewClient(&copilot.ClientOptions{
        CLIUrl: os.Getenv("TEST_CLI_URL"),
    })

    if err := client.Start(ctx); err != nil {
        t.Fatal(err)
    }
    defer client.Stop()

    session, err := client.CreateSession(ctx, &copilot.SessionConfig{Model: "gpt-4.1"})
    if err != nil {
        t.Fatal(err)
    }

    response, err := session.SendAndWait(ctx, copilot.MessageOptions{Prompt: "Say hello"})
    if err != nil {
        t.Fatal(err)
    }

    if response.Data.Content == nil {
        t.Error("expected content, got nil")
    }
}
```

---

## .NET Tests

### Test Runner

The .NET SDK uses [xUnit](https://xunit.net/).

```bash
cd dotnet
dotnet test test/GitHub.Copilot.SDK.Test.csproj
dotnet test --verbosity normal   # Verbose output
dotnet test --filter "FullyQualifiedName~SessionTests"  # Run specific tests
```

### Test Location

```
dotnet/
  test/
    GitHub.Copilot.SDK.Test.csproj
    *Tests.cs
```

### Writing a New Test

```csharp
using GitHub.Copilot.SDK;
using Xunit;

public class SessionTests
{
    [Fact]
    public async Task Session_SendsMessageAndReceivesResponse()
    {
        var cliUrl = Environment.GetEnvironmentVariable("TEST_CLI_URL");
        await using var client = new CopilotClient(new CopilotClientOptions { CliUrl = cliUrl });
        await using var session = await client.CreateSessionAsync(new SessionConfig { Model = "gpt-4.1" });

        var response = await session.SendAndWaitAsync(new MessageOptions { Prompt = "Say hello" });

        Assert.NotNull(response?.Data.Content);
    }
}
```

---

## Adding Test Scenarios (Snapshots)

To add a new scenario to the replay harness:

1. **Identify the interaction** you want to test.
2. **Add a YAML snapshot** in `test/snapshots/` based on the existing format.
3. **Write the test** in the appropriate SDK test directory, pointing at the new snapshot.
4. **Verify locally** with `just test` or the relevant SDK test command.

---

## Linting

Run linters to catch style issues before submitting a PR:

```bash
# All SDKs
just lint

# Individual
just lint-nodejs   # ESLint
just lint-python   # ruff
just lint-go       # golangci-lint
just lint-dotnet   # dotnet format --verify-no-changes
```

---

## Continuous Integration

Tests are run automatically on pull requests via GitHub Actions:

| Workflow | File |
|----------|------|
| Node.js tests | `.github/workflows/nodejs-sdk-tests.yml` |
| Python tests | `.github/workflows/python-sdk-tests.yml` |
| Go tests | `.github/workflows/go-sdk-tests.yml` |
| .NET tests | `.github/workflows/dotnet-sdk-tests.yml` |
| Docs validation | `.github/workflows/docs-validation.yml` |

---

## Related Documentation

- [Local Development Setup](./local-development.md)
- [Getting Started Tutorial](./getting-started.md)
- [Contributing Guide](../CONTRIBUTING.md)
