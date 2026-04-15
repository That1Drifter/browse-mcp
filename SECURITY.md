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

### 7. Playwright `storageState` for explicit, auditable auth reuse

If you want persistent auth for *specific* sites only — without giving every
agent run implicit access to everything — Playwright's `storageState` API
lets you export and reimport a scoped set of cookies/localStorage from a
JSON file you control. That's outside the scope of browse-mcp's built-in
tools today, but it's the pattern to reach for if the default persistent
profile is too broad for your threat model. See the Playwright docs on
[authentication](https://playwright.dev/docs/auth) for details.

## Quick decision guide

| Situation | Recommended setting |
|---|---|
| Local dev, you want OAuth to survive across sessions | Default (persistent profile) |
| CI / shared machine / untrusted agent runs | `BROWSE_MCP_EPHEMERAL=1` |
| One-off task against a high-value account | Default, then `browser_reset_profile` after |
| Multiple unrelated projects on one machine | Per-project `BROWSE_MCP_HOME` |
