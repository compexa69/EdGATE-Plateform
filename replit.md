# EdTech Study Platform

A dark-mode PWA for serious competitive exam preparation (JEE/NEET/GATE) with SRS-gated study progression, spaced repetition quizzes, Pomodoro timer, and admin controls.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/edtech-platform run dev` — run the frontend (port 18184)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite lib packages (run before api-server typecheck)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, React Query (generated hooks), React Router
- API: Express 5, pino logging
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec`)
- Build: esbuild (ESM bundle)
- Storage: Backblaze B2 (PDFs, photos) via `@aws-sdk/client-s3`
- Email: Resend API
- Auth: JWT (SESSION_SECRET), bcrypt passwords

## Where things live

- `artifacts/api-server/src/routes/` — all API route handlers
- `artifacts/api-server/src/lib/auth.ts` — JWT sign/verify, requireAuth middleware
- `artifacts/api-server/src/types/express.d.ts` — Express Request augmentation (user field)
- `artifacts/edtech-platform/src/` — React frontend, pages, components
- `lib/db/src/schema/` — Drizzle table definitions (source of truth for DB shape)
- `lib/db/src/schema/index.ts` — barrel export for all tables
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-zod/src/` — generated Zod schemas (do not edit manually)

## Architecture decisions

- **Contract-first API**: OpenAPI spec → Orval codegen → React Query hooks + Zod validators. Never write hooks by hand.
- **SRS gating (v7.3)**: Topic progression is locked behind sequential steps: Lecture → LectureQuiz → DPP → PYQ → TopicTest → ChapterTest → PDFUpload. Stored in `topic_progress` table.
- **First user = super_admin**: Registration logic auto-assigns `super_admin` role to the first user; subsequent users are `pending_approval`.
- **Express global namespace augmentation**: `req.user` typed via `declare namespace Express { interface Request }` in `src/types/express.d.ts` (NOT via `declare module "express"` — that form doesn't merge correctly with the tsconfig `types: ["node"]` setup).
- **B2 storage**: All file uploads (lecture PDFs, notes) go to Backblaze B2 via presigned S3-compatible URLs; file metadata stored in DB.

## Product

- Onboarding carousel → Auth (register/login with mobile OTP or email/password)
- Subject → Chapter → Topic hierarchy with SRS-gated step progression
- Per-topic: Lecture viewer, Quiz, DPP, PYQ, TopicTest, ChapterTest, PDF upload
- Dashboard with streak, XP, Pomodoro timer, Today's tasks
- Notes with Markdown support
- Admin panel: user approval, subject/chapter/topic/question management
- Dark-mode-first design: Deep Slate (#0F172A) background, Focus Indigo (#6366F1) primary

## User preferences

- Dark-mode-first UI with Deep Slate (#0F172A) + Focus Indigo (#6366F1)
- Mobile regex: `^(\+91)[\s-]?[6-9]\d{9}$`
- Indian competitive exam focus: JEE / NEET / GATE

## Gotchas

- Always run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — the DB lib must be rebuilt first.
- Do NOT run `pnpm dev` at workspace root (no such script; individual workflows handle dev).
- Zod schema names must match OpenAPI operationId conventions: `ListNotesQueryParams` not `ListNotesParams`, etc.
- `examAttemptsTable` lives in `lib/db/src/schema/attempts.ts`; `examQuestionsTable` in `lib/db/src/schema/exams.ts`.
- Vite artifact must use `PORT` env var (set by workflow); do not hardcode port.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
