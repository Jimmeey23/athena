---
name: Vite dev server Replit config
description: Vite must bind to 0.0.0.0:5000 for Replit webview workflow to work.
---

In `vite.config.ts`:
```
server: { host: "0.0.0.0", port: 5000, allowedHosts: true }
```

**Why:** Replit webview workflow requires port 5000. IPv6 (::) binding fails with EAFNOSUPPORT. allowedHosts:true needed for proxied iframe preview.
**How to apply:** Any time the dev server needs to be visible in the Replit preview pane.
