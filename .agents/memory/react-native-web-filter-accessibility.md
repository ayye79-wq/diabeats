---
name: React Native Web filter accessibility
description: Accessibility state behavior for selectable React Native Pressables rendered on the web.
---

For selectable filters, provide native `accessibilityState` and an explicit ARIA checked state when rendering a radio-like choice.

**Why:** React Native Web exposes the control role but does not reliably serialize `accessibilityState.checked` into the browser's `aria-checked` attribute for a generic Pressable. Without the explicit web attribute, assistive technology and browser E2E checks cannot determine the selected choice.

**How to apply:** Use radio semantics for mutually exclusive filter chips, pair `accessibilityState={{ checked: isSelected }}` with `aria-checked={isSelected}`, and verify the rendered DOM state in a browser test.