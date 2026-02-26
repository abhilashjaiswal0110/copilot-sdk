# Local Development Setup

This guide walks you through setting up the GitHub Copilot SDK repository on your local machine for development and testing.

## Prerequisites

### Required for All SDKs

| Tool | Version | Purpose |
|------|---------|---------|
| [Git](https://git-scm.com/) | 2.x+ | Version control |
| [Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) | Latest | Required runtime for SDK |
| [just](https://github.com/casey/just) | Latest | Optional task runner (recommended) |

### Language-specific Requirements

| SDK | Runtime | Version |
|-----|---------|---------|
| Node.js / TypeScript | [Node.js](https://nodejs.org/) | 18+ |
| Python | [Python](https://www.python.org/) + [uv](https://github.com/astral-sh/uv) | 3.9+ |
| Go | [Go](https://go.dev/) + [golangci-lint](https://golangci-lint.run/) | 1.21+ |
| .NET | [.NET SDK](https://dotnet.microsoft.com/download) + Node.js (for test harness) | 8.0+ |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/abhilashjaiswal0110/copilot-sdk.git
cd copilot-sdk
```

---

## Step 2: Install the Copilot CLI

The SDKs communicate with the GitHub Copilot CLI in server mode. You must install and authenticate it before using any SDK locally.

```bash
# Follow the official guide:
# https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli

# Verify installation
copilot --version

# Authenticate (if not already signed in)
copilot auth login
```

---

## Step 3: Install Dependencies

### Option A: Install All SDKs (Recommended)

```bash
# From the repo root
just install
```

This runs:
- `cd nodejs && npm ci`
- `cd python && uv pip install -e ".[dev]"`
- `cd go && go mod download`
- `cd dotnet && dotnet restore`

### Option B: Install Individual SDKs

<details>
<summary><strong>Node.js / TypeScript</strong></summary>

```bash
cd nodejs
npm ci
```

</details>

<details>
<summary><strong>Python</strong></summary>

```bash
cd python
uv pip install -e ".[dev]"
```

If you do not have `uv` installed:

```bash
pip install uv
uv pip install -e ".[dev]"
```

</details>

<details>
<summary><strong>Go</strong></summary>

```bash
cd go
go mod download
```

Install `golangci-lint` for linting:

```bash
# macOS
brew install golangci-lint

# Linux / other
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin
```

</details>

<details>
<summary><strong>.NET</strong></summary>

The .NET tests depend on a TypeScript-based test harness, so Node.js is required.

```bash
# Install Node.js test harness dependencies first
cd nodejs && npm ci
cd test/harness && npm ci

# Install .NET dependencies
cd dotnet && dotnet restore
```

</details>

---

## Step 4: Verify Your Setup

Run a quick smoke test to verify everything is working:

```bash
# Run all tests (requires all runtimes installed)
just test

# Or test a specific SDK
just test-nodejs
just test-python
just test-go
just test-dotnet
```

---

## Development Workflow

### Running Tests

```bash
# All SDKs
just test

# Individual SDKs
just test-nodejs     # Node.js (Vitest)
just test-python     # Python (pytest)
just test-go         # Go (go test)
just test-dotnet     # .NET (dotnet test)

# Direct commands
cd nodejs && npm test
cd python && uv run pytest
cd go && go test ./...
cd dotnet && dotnet test test/GitHub.Copilot.SDK.Test.csproj
```

### Linting and Formatting

```bash
# Lint all SDKs
just lint

# Format all code
just format

# Per-SDK
just lint-nodejs
just lint-python
just lint-go
just lint-dotnet
```

### Running a Quick Local Example

After installing an SDK, try a quick test to ensure the Copilot CLI integration works:

<details>
<summary><strong>Node.js</strong></summary>

Create `/tmp/test-sdk.ts`:

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
const session = await client.createSession({ model: "gpt-4.1" });
const response = await session.sendAndWait({ prompt: "Say 'SDK works!' in exactly those words." });
console.log(response?.data.content);
await client.stop();
process.exit(0);
```

Run:

```bash
cd nodejs
npx tsx /tmp/test-sdk.ts
```

</details>

<details>
<summary><strong>Python</strong></summary>

Create `/tmp/test_sdk.py`:

```python
import asyncio
from copilot import CopilotClient

async def main():
    client = CopilotClient()
    await client.start()
    session = await client.create_session({"model": "gpt-4.1"})
    response = await session.send_and_wait({"prompt": "Say 'SDK works!' in exactly those words."})
    print(response.data.content)
    await client.stop()

asyncio.run(main())
```

Run:

```bash
cd python
uv run python /tmp/test_sdk.py
```

</details>

---

## Connecting to a Local CLI Server

For faster development iteration, you can run the Copilot CLI in server mode once and reuse it:

```bash
# Start the CLI in server mode on a fixed port
copilot --headless --port 4321
```

Then configure your SDK to connect to it (avoids restarting the CLI on every run):

```typescript
// Node.js
const client = new CopilotClient({ cliUrl: "localhost:4321" });
```

```python
# Python
client = CopilotClient({"cli_url": "localhost:4321"})
```

```go
// Go
client := copilot.NewClient(&copilot.ClientOptions{CLIUrl: "localhost:4321"})
```

```csharp
// .NET
var client = new CopilotClient(new CopilotClientOptions { CliUrl = "localhost:4321", UseStdio = false });
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `COPILOT_CLI_PATH` | Override path to the Copilot CLI binary |
| `COPILOT_GITHUB_TOKEN` | GitHub token for Copilot authentication |
| `GH_TOKEN` | Alternative GitHub token |
| `GITHUB_TOKEN` | Alternative GitHub token (CI environments) |

---

## IDE Setup

### VS Code

This repository includes VS Code settings in `.vscode/`. Open the workspace and install the recommended extensions when prompted.

A `.devcontainer/` configuration is also included for development inside a container. Open the folder in VS Code and select **Reopen in Container** when prompted.

### JetBrains IDEs

No special configuration is required. Open the repo root and configure the language SDK paths according to your IDE's settings.

---

## Troubleshooting

### `copilot: command not found`

The Copilot CLI is not installed or not in `PATH`. Follow the [installation guide](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli).

### Authentication errors

Run `copilot auth login` to re-authenticate, or set a valid `COPILOT_GITHUB_TOKEN` environment variable.

### Port already in use

If running the CLI in server mode and the port is occupied:

```bash
# Use a different port
copilot --headless --port 4322
```

### Node.js version mismatch

Ensure you are using Node.js 18 or later:

```bash
node --version  # Should be v18.x.x or higher
```

Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage Node versions.

---

## Related Documentation

- [Testing Guide](./testing.md)
- [Getting Started Tutorial](./getting-started.md)
- [Authentication](./auth/index.md)
- [Use Cases & Examples](./use-cases/README.md)
- [Contributing Guide](../CONTRIBUTING.md)
