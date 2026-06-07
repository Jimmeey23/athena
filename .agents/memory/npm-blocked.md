---
name: npm blocked packages in Replit
description: Several test packages are blocked by Replit security policy; workaround for npm install.
---

Blocked packages: vitest@2.1.9, @testing-library/react, @testing-library/user-event, jsdom.

**Workaround:** Temporarily remove them from package.json devDependencies, run npm install, then restore them manually.
**Why:** Replit's package firewall blocks these specific packages/versions. The app itself doesn't need them to run in dev mode.
**How to apply:** Whenever a fresh npm install is needed (e.g. after deleting node_modules).
