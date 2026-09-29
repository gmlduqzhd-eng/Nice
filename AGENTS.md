<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project: 담임노트

- Read `README.md` and `docs/PRODUCT.md` for scope before changing behavior.
- Keep Korean UI copy clear and teacher-facing. This is a fictional-data prototype.
- Preserve the distinction between copied text and teacher-confirmed NEIS entry.
- Text or evidence edits must invalidate previously completed review/confirmation.
- Domain rules live in `src/lib/domain.ts`; keep UI, NEIS API, and backup adapters separate.
- No credentials or real student data in source, logs, fixtures, or documentation.
- Keep all dependency versions pinned and update the pnpm lockfile when dependencies change.
- Run `pnpm typecheck`, `pnpm test`, `pnpm build`; run relevant `pnpm test:e2e` flows when changing UI behavior.
- `supabase/schema.sql` was applied through the Supabase dashboard SQL Editor to the existing Nice development project on 2026-09-29. It is not migration history and must not be replayed blindly. Future schema changes require checking the actual project schema and isolated access tests.
- Read `docs/DEPLOYMENT.md` and `docs/VERIFICATION.md` for the active GitHub/Vercel/Supabase targets and verified limits. SQL RLS checks passed. Actual Google login and cloud save/restore in one Chrome browser passed with fictional data. The user reported a successful restore message in another browser; its restored content was not directly compared. Email login, another physical PC, and isolation between two real authenticated users remain unverified.
- Never claim a live integration, remote migration, or deployment is complete without verifying it.
- `e2e/neis-extension.spec.ts` loads the real extension and invokes its action in a temporary Chrome profile using browser-level CDP. The extension debugging flag is test-only; never enable it on a user's normal profile. Tested with Chrome 154.0.8037.58. This validates the fictional practice page, not actual NEIS compatibility or Edge installation.
