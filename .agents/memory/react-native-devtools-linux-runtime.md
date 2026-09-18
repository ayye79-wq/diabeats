---
name: Native DevTools dependency cascades
description: How to diagnose native runtime dependency failures from bundled desktop DevTools.
---

An optional desktop DevTools launcher can report one missing shared library while additional native dependencies remain unresolved.

**Why:** The JavaScript dev server can still start when an optional native DevTools binary cannot. Fixing only the first reported dependency can turn one startup warning into the next, rather than restoring the debugger.

**How to apply:** After an upgrade changes a bundled DevTools launcher, validate a complete startup and resolve the full set of native dependencies evidenced by its output. Do not treat the first missing-library message as the complete diagnosis.