# Security

browse-mcp drives a real Chromium instance via Playwright. By default it uses a
**persistent** browser profile so that once you complete OAuth / MFA / CAPTCHA
for a site, subsequent agent runs stay signed in. That convenience has real
security trade-offs. This document covers what's stored, where, who can read
it, how to reset, and how to opt out.

## Reporting a vulnerability

Please email **americanemt@gmail.com** with details. Do not open a public issue
for undisclosed vulnerabilities.

## What is stored on disk

The persistent profile is a normal Chromium user-data directory. It contains:

- **Cookies** (session and persistent), including authenticated sessions for
  every site you've signed into during a `browser_handoff`.
- **localStorage / sessionStorage / IndexedDB** — where many sites park OAuth
  access tokens, refresh tokens, CSRF tokens, and app state.
- **Saved passwords / autofill** if you trigger Chromium's built-in save
  prompts during a handoff (uncommon but possible).
- **Service-worker caches** and HTTP cache.
- **History**, **favicons**, and other standard Chromium profile data.

### Profile location

| Platform | Default path |
|---|---|
| Linux / macOS | `~/.browse-mcp/chromium-profile/` |
| Windows | `%USERPROFILE%\.browse-mcp\chromium-profile\` |

Override with the `BROWSE_MCP_HOME` env var — the profile will live at
`$BROWSE_MCP_HOME/chromium-profile/`.

## Threat model

### In scope

- **Local code execution on the host.** Any process running as your user can
  read the profile directory. That means a piece of malware, a compromised
  dev tool, a rogue `npm install` post-install script, or a second agent on
  the same machine can exfiltrate session cookies and refresh tokens and
  replay them against every service you've signed into via browse-mcp. The
  profile has **no encryption at rest** beyond the default filesystem ACLs
  provided by your OS.
- **Lateral blast radius from the agent itself.** An LLM agent driving
  browse-mcp inherits authenticated access to every site you've logged into.
  A prompt-injection payload served by one page can, in principle, pivot the
  agent to another authenticated tab and take actions there.
- **Leftover auth after sensitive work.** Auth survives process exit. If you
  signed into a high-value account (bank, cloud console, email) for a
  one-off task, those cookies are still on disk days later.

### Out of scope

- Kernel-level or hypervisor-level attackers, physical access to an
  unencrypted disk, and attacks against Chromium itself.

## Mitigations

### 1. Ephemeral mode (recommended for sensitive / one-off work)

Set the env var before launching the MCP server:

```sh
BROWSE_MCP_EPHEMERAL=1
```

Accepted truthy values: `1`, `true`, `yes` (case-insensitive).

In ephemeral mode browse-mcp uses `chromium.launch()` + `browser.newContext()`
instead of `launchPersistentContext()`. **Nothing is written to the profile
directory** — cookies, localStorage, and auth all live in memory and vanish
when the browser closes. You will need to re-authenticate (via
`browser_handoff`) on every run. This is the right mode for agents running
in CI, shared machines, or any context where persistent auth is undesirable.

### 2. `browser_reset_profile` tool

browse-mcp exposes a `browser_reset_profile` MCP tool that closes the browser
and recursively deletes the profile directory. Use it:

- After completing sensitive work you don't want lingering on disk.
- As routine hygiene (e.g., weekly).
- When the profile is in a bad state (corrupted, stuck auth, etc.).

It requires `confirm: true` and is destructive. In ephemeral mode it's a
no-op aside from closing the browser.

### 3. Manual reset

```sh
# Linux / macOS
rm -rf ~/.browse-mcp/chromium-profile

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:USERPROFILE\.browse-mcp\chromium-profile"
```

### 4. Dedicated browser accounts

For high-value services, consider using a browser-only account (e.g., a
dedicated Google account with limited scope) rather than your primary
identity when authenticating during a `browser_handoff`.

### 5. Isolated `BROWSE_MCP_HOME` per project

If you want each project's agent to have its own profile instead of sharing
one global profile, set `BROWSE_MCP_HOME` to a project-local path. This
doesn't reduce the on-disk exposure but limits blast radius: a compromise of
one project's profile doesn't reveal auth for unrelated work.

### 6. Filesystem permissions

On Linux/macOS, ensure the parent directory is mode `0700`:

```sh
chmod 700 ~/.browse-mcp
```

On Windows, the default per-user profile path inherits user-only ACLs, which
is usually adequate against other local users but **not** against malware
running as you.

### 7. `browser_save_state` / `browser_load_state` for explicit, auditable auth reuse

If you want persistent auth for *specific* sites only — without giving every
agent run implicit access to everything — the `browser_save_state` and
`browser_load_state` tools export and reimport cookies + localStorage as a
JSON file you control (default `~/.browse-mcp/state/<name>.json`, written
with `0600` permissions where the OS supports it). Combine with
`BROWSE_MCP_EPHEMERAL=1` for a profile that starts empty and gets exactly
the auth you load into it.

**The exported file contains live session tokens.** Anyone who reads it can
hijack those sessions until they expire. Treat it like a password file: do
not commit it, do not transfer it over untrusted channels, delete it when
no longer needed.

### 8. Origin fence for autonomous agents

Page content can steer an autonomous agent toward arbitrary URLs (prompt
injection via links). Two env vars restrict where the browser may navigate:

```sh
# Allowlist: only these hosts (and their subdomains) are reachable
BROWSE_MCP_ALLOWED_ORIGINS=example.com,docs.python.org

# Blocklist: these hosts are refused even if allowed elsewhere
BROWSE_MCP_BLOCKED_ORIGINS=accounts.google.com
```

`browser_navigate` refuses fenced URLs with a clear message, and a
context-level route backstop catches redirects, JS-initiated navigations,
and new tabs, replacing the page with a "Blocked by origin fence"
explanation. Only top-level (document) navigations are fenced; subresources
(CDN scripts, images) load normally so allowed pages render correctly.
Blocked attempts are logged to `issues.jsonl`.

## Quick decision guide

| Situation | Recommended setting |
|---|---|
| Local dev, you want OAuth to survive across sessions | Default (persistent profile) |
| CI / shared machine / untrusted agent runs | `BROWSE_MCP_EPHEMERAL=1` |
| One-off task against a high-value account | Default, then `browser_reset_profile` after |
| Multiple unrelated projects on one machine | Per-project `BROWSE_MCP_HOME` |
| Visiting untrusted pages mid-session while the profile holds auth | `browser_context` open — isolated context shares no cookies/auth with the profile |
| Autonomous agent that should only reach known sites | `BROWSE_MCP_ALLOWED_ORIGINS` |
