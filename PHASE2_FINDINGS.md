# Phase 2 — Findings & Revised Priorities

Combining real usage data (`~/.browse-mcp/issues.jsonl`) with external research.

## Confirmed friction (from dogfooding)

| Site | Issue | Root cause |
|---|---|---|
| YouTube | 0 interactive refs | `querySelectorAll('*')` does not pierce shadow roots |
| w3schools iframe demo | Cannot reach elements inside iframes | Walker only traverses main document |
| MDN | 641 refs / 17KB snapshot | No size budget or prioritization hint |

## Research cross-check

- **Google's own `chrome-devtools-mcp`** has an open issue (#716) asking for subtree snapshots for exactly the same efficiency reason. Validates the priority.
- **Stagehand** (Browserbase's fork that "graduated from Playwright") added `act` / `extract` / `observe` — AI-native primitives. Different philosophy, not necessarily better for our agentic use case.
- **axe-core + Playwright** is a solved integration (Checkly, Deque, many guides). Drop-in for Phase 2 a11y audit.
- **Shadow DOM piercing** is a recognized industry pain. Two viable approaches: (a) recursive `shadowRoot` traversal in the tagging script, (b) use Playwright's built-in pierce locators which cross shadow boundaries automatically.

## Revised Phase 2 priorities

Order changed based on what *actually* broke:

### P0 — fix the snapshot holes
1. **Shadow DOM piercing** — extend `TAG_SCRIPT` to recurse into every `shadowRoot`. Small code change, massive coverage improvement.
2. **Iframe traversal** — walk same-origin iframes (cross-origin requires `page.frames()` and is harder; do same-origin first).

### P1 — tame snapshot size
3. **Auto-summarize oversized snapshots** — if full tree > N lines, return only interactive + heading nodes with a hint telling Claude to re-request with `selector` for the subtree of interest.
4. **Token budget param** — `browser_snapshot { max_tokens: N }` — truncate + append `[... N more elements ...]` so Claude knows there's more.

### P2 — new capabilities (from original plan, still valid)
5. `browser_a11y_audit` — axe-core integration, ~30 lines.
6. `browser_inspect_css` — CDP cascade for debugging styles.
7. `browser_handoff` / `browser_resume` — visible browser for CAPTCHA/MFA.

### Deferred
- `browser_modify_style` + undo
- `browser_responsive`, `browser_cleanup`, `browser_cursor_interactive` (the `@c` scan is already implemented; just unused — wire it up when Phase 2 is done)

## What we learned about the feedback loop

- Automatic error logging captured nothing new in this run (no errors — tools didn't fail, they just returned incomplete data). Useful lesson: **errors alone are insufficient signal**. The `browser_report_difficulty` path was essential — it caught "0 refs on YouTube" which was not an error, just wrong.
- Consider auto-detecting suspicious results (empty snapshot on a non-empty page, etc.) and auto-reporting them. That would close the loop further.

## Proposed execution order

1. Shadow DOM + iframe fixes (Priority 0) — likely ~2 hours
2. Size management (Priority 1) — ~1 hour
3. a11y audit (axe-core) — ~1 hour
4. CSS inspector — ~2 hours
5. Handoff/resume — ~3 hours

Total Phase 2: ~1 day of focused work. Each step is independently testable via the existing dogfood harness.
