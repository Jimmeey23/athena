---
name: AI model upgrade
description: Claude upgraded to claude-opus-4-5, max tokens 8192 for all providers in the Athena ticketing assistant.
---

Changed in `supabase/functions/_shared/ai-provider.ts`.
- OpenAI: gpt-4.1, 8192 max tokens
- Claude: claude-opus-4-5, 8192 max tokens  
- DeepSeek: deepseek-v4-pro, 8192 max tokens

**Why:** Upgraded from claude-3-5-haiku for better reasoning and context handling in ticket intake.
**How to apply:** Always keep all three providers in sync when upgrading model/token config.
