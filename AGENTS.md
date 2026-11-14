# Folio repository harness

Read `README.md`, `docs/product/PRD.md`, and `docs/harness/architecture.md` before changing product behavior. Full conventions: `docs/harness/standards.md`. Operations: `docs/harness/operations.md`.

For implementation beyond the prototype, read `docs/architecture/technical-architecture.md` first. It is the development baseline: `.env` is the sole authored configuration source. `scripts/configure.mjs` generates `wrangler.jsonc`; never edit deployment parameters there manually. `scripts/cloudflare.mjs` synchronizes only allowlisted runtime secrets and deploys the built Worker. pi-ai owns model access. Both pi-ai and pi-durable runtimes execute the same validated domain tools. pi-durable uses native SQLite-backed Durable Objects per authenticated user/thread/request. Resumes and the full UI chat archive remain browser-local; D1 stores authentication, billing ledger/subscriptions and cached pi-ai results. Do not claim cloud business storage or token streaming exists.

## Stack

React 19 + TanStack Start + Vite + Cloudflare Workers/Static Assets. Astryx is the design system, assistant-ui owns chat runtime, Better Auth owns Google OAuth/session, D1 stores authentication and billing; full resume/chat libraries remain browser-local. Resume storage is browser-local and partitioned by identity.

## Commands

- `npm ci`; `npm run dev`
- `npm run check`; `npm test`; `npm run test:e2e`; `npm run build`
- E2E uses headless installed Google Chrome; configure Playwright for Chromium if unavailable.
- `npm run astryx -- component Button` and `npm run astryx -- component <Name>` for current UI APIs. Do not guess Astryx props.
- `npm run db:migrate:local` for local D1 only. Remote deployment/migration changes need the user's intended environment.

## Boundaries

- Pure resume schemas/rules: `src/domain/`.
- Resume rendering/editing: `src/components/resume/`; no auth, model, or chat dependencies.
- Chat: `src/components/chat/`; use assistant-ui lifecycle instead of a second message store.
- Secrets/Cloudflare APIs: `src/server/` and server route handlers only.
- Do not hand-edit `src/routeTree.gen.ts`.
- Never commit `.dev.vars`, tokens, real resumes, or `.wrangler/` data.

## Invariants

- Never invent facts, numerical achievements, qualifications, or ATS scores.
- Import must clear sample identity and unsupported fields. JD missing skills remain missing.
- Ordinary chat edits and polish update the selected resume in place, preserving its id, label and list position. Only imports and JD tailoring create new library entries. Normalize identity/provenance in shared domain code, never trust model-assigned IDs. Do not automatically remove historical copies.
- Selecting a resume, returning to chat or changing templates must never replay a generation command. Acknowledge shortcut commands in the parent after enqueueing.
- Duplicate cleanup is explicit and compares all content except id/updatedAt; preserve the selected copy. Undo must not overwrite subsequent edits or another identity's data.
- Individual deletion supports the same scoped undo. An empty saved library must remain empty; seed examples only when the storage key does not exist. Never persist the empty import context as a resume.
- Confirm every destructive removal (resume, experience, duplicates); default focus to cancel. Derive navigation from the canonical library and sync storage events without replaying Agent commands.
- Live signed-out users see the landing page, not the workspace. Demo entry is explicit. Never silently downgrade after a config failure.
- Preserve example provenance on generated polish/tailor versions, clear it on fresh imports, and render explicit example labels in preview/print.
- ResumeDocument is the single renderer for preview, templates and print.
- Summary, skills and experience bullets use Markdown-compatible strings, never a parallel HTML store. RichTextEditor edits and RichText renders the semantic whitelist. Sanitize pasted/document HTML. PDF/DOCX extraction is browser-local, cancellable and bounded by IMPORT_* from .env; review before Agent, no OCR or layout fidelity claims. See docs/architecture/document-import.md.
- Scope changes must not write old identity data into the new localStorage partition. Discard stale run results.
- Demo is deterministic and visibly labelled; live requires a session and configured server-side provider.
- Update product/harness docs with behavior changes; report external integration validation honestly.
- Keep UI task-focused: no slogans, decorative status labels or repeated instructions. Preserve semantic controls, visible factual gaps and example labels. Apply the UX/DX/AX contract in `docs/product/interface.md`.
- The conversation owns full viewport height: no shared page header, toolbar or source card above messages. Keep tools in the composer popover and mobile preview/account navigation in the sidebar. Verify long-message scrolling and composer visibility.

- Section layout is data (`sectionOrder`), shared by preview/templates/print. Success messages must follow verified tool results, not model claims.
- Template IDs/defaults live in domain/resume-presentation.ts. Optional presentation stores per-resume summary/skills/bullets/density, never transforms facts. resume_set_presentation is the shared validated layout tool; ordinary resume_update must preserve presentation. See docs/architecture/resume-presentation.md.
- Chat archives are scoped by identity and restored through assistant-ui initialMessages. Pass bounded history to pi; imports exclude prior identities. Durable refresh must reuse the immutable pending request/requestId. A disconnect is not an abort.

- Billing is server-authoritative. Preserve atomic reservation, tariff snapshots, tenant isolation and idempotent settlement in both pi runtimes. Read `docs/architecture/billing.md` before changing metering or Stripe. Never grant paid access from a redirect URL, client state, unverified webhook or estimated tokens.
