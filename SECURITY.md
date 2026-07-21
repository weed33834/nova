# Security Policy

## Supported Versions

Nova is under active development. Security fixes are applied to the latest `main` branch.

| Version | Supported |
|---------|-----------|
| latest main | Yes |
| tagged releases | Yes |
| older branches | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, report it privately:

1. Open a private security advisory on GitHub: **Security** tab → **Report a vulnerability**
2. Or email the maintainer directly

Please include:

- A clear description of the vulnerability
- Steps to reproduce
- The potential impact
- Suggested fix if you have one

You should receive a response within 72 hours. Please do not disclose the vulnerability publicly until a fix has been released.

## Security Measures

Nova implements the following security measures:

### Content Guardrails

- **PII Detection** — Personally identifiable information is scanned and redacted before display
- **Toxicity Filtering** — Generated content is screened for toxic, harmful, or inappropriate language
- **Hallucination Scanning** — Detection checks flag potentially fabricated claims in generated educational content

### API Key Handling

- Server-side provider configuration (`server-providers.yml`) keeps API keys off the client
- Client-side keys (`.env.local`) are used only in development
- No API keys are committed to the repository

### Runtime Constraints

- Each AI agent has enforced `max_actions` and `max_turns` limits
- The skill registry is gated by a whitelist — only approved tools can be invoked
- MCP tool integration requires explicit configuration

### Data Storage

- All learner state is stored locally in the browser (IndexedDB / localStorage)
- No learner data is sent to external servers unless a server backend is configured
- The KV namespace (`nova:*`) isolates Nova's storage from other applications

## Dependency Security

- Dependencies are managed via `pnpm` with lockfile integrity checks
- Run `pnpm audit` to check for known vulnerabilities
- Updates to security-critical dependencies should be prioritized
