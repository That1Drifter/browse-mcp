# Versioning Policy

`browse-mcp` follows [Semantic Versioning 2.0.0](https://semver.org/), adapted
for an MCP (Model Context Protocol) server where the public API is the set of
exposed tools and their input/output schemas.

## Current Phase: 0.x (Pre-1.0)

While on `0.x`, the project follows **semver with a loose major-bump rule**:
breaking changes bump the **minor** version (per semver's allowance for `0.y.z`),
but they will still be called out clearly in the changelog. Once the tool
surface stabilizes, the project will move to `1.0.0` and strict semver.

Concretely, for `0.x`:

- `0.MINOR.PATCH`
- Breaking changes -> bump `MINOR`, reset `PATCH`.
- Backward-compatible additions and fixes -> bump `PATCH`.

Post-1.0, the rules below apply in their strict form (major/minor/patch).

## What Counts as What

### MAJOR (breaking) — post-1.0, or any 0.x release flagged "BREAKING"

Anything an existing MCP client config or agent prompt may rely on that is
removed or changed in an incompatible way:

- Removing or renaming a tool.
- Removing or renaming a tool input parameter.
- Making a previously optional parameter required.
- Narrowing a parameter's accepted type or value range (e.g. string -> enum).
- Changing the shape of a tool's return payload in a non-additive way
  (removing fields, renaming fields, changing field types).
- Removing or renaming an environment variable the server reads
  (e.g. `BROWSE_MCP_TOOLS`), or changing its semantics.
- Raising the minimum supported Node.js version.
- Changing the published binary name (`browse-mcp`).

### MINOR (new, backward-compatible)

- Adding a new tool.
- Adding a new optional parameter to an existing tool.
- Widening a parameter's accepted values (e.g. new enum variant).
- Adding new fields to a tool's return payload.
- Adding a new environment variable or config knob with a safe default.
- Deprecating (but not yet removing) a tool or parameter. Deprecations are
  announced at least one minor release before removal.

### PATCH (bug fix / internal)

- Bug fixes that restore documented behavior.
- Performance improvements with no observable API change.
- Dependency bumps that don't change the public tool surface.
- Documentation-only changes.
- Internal refactors, test changes, CI changes.

## Release Process

1. Update `CHANGELOG.md` — move items from `Unreleased` into a new version
   section with today's date.
2. Bump `version` in `package.json` per the rules above.
3. Commit: `release: vX.Y.Z`.
4. Tag: `git tag vX.Y.Z && git push --tags`.
5. Publishing to npm from tags via GitHub Actions is planned (tracked
   separately).

## Deprecation Policy

When a tool or parameter is slated for removal:

- It is marked deprecated in its description and in `CHANGELOG.md` under a
  `Deprecated` heading in a MINOR release.
- It continues to work for at least one subsequent MINOR release.
- It is removed in the next MAJOR (or, during `0.x`, the next MINOR flagged
  "BREAKING").
