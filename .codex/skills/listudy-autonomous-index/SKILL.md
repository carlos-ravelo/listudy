---
name: listudy-autonomous-index
description: Find architectural context for Listudy workflows that cross server, storage, and browser boundaries, or use its project indexes when requested.
---

# Listudy project context

For a localized task, search named files, symbols, or feature terms with `rg -n` first. Read matching functions and a small amount of surrounding context with line ranges (for example, `sed -n '120,180p'`). Expand the range only when a call, data shape, or control flow remains unclear. Read an entire source file only when it is short or understanding the task genuinely requires the whole file.

For questions about architecture, data flow, or responsibilities across layers, consult `docs/architecture.md` from the repository root when that context is not already available in the conversation. Follow its source links to verify the behavior relevant to the task; ordinary edits do not require reading the overview.

If ownership remains unclear, or the user requests index navigation, search `docs/project-context/master_index.md` for relevant entries and inspect only the matching sections and sub-index sections. These are incomplete declaration snapshots, not dependency maps. Avoid loading every sub-index or the aggregate `project_context.txt`.

Current source is authoritative. Follow actual calls, routes, and persistence operations; do not infer behavior from filenames or signatures alone. If documentation is missing or stale, continue with source searches.

Update the overview when a requested change alters a documented architectural relationship. Routine changes do not require refreshing the index collection. Retrieve accessible files autonomously and ask for specific files only when tools cannot access them.
