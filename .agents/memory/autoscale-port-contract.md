---
name: Autoscale port contract
description: Port behavior required for the DiabEats autoscale deployment.
---

Keep the production server command free of a fixed `PORT` override and let the deployment platform supply it. Development remains compatible because the server has a local fallback port.

**Why:** Autoscale readiness checks address the port supplied for the published service. A production script that overwrites it can make an otherwise healthy server unreachable during promotion.

**How to apply:** When changing production startup scripts or deployment settings, preserve `process.env.PORT`, bind on `0.0.0.0`, and verify `GET /` returns HTTP 200 when launched with an arbitrary port.