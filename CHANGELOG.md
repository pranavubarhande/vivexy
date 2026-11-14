# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-11-14

### Added

- `DELETE /users/me/history` deletes all of the caller's chats, document
  analyses and workflow runs ("delete my AI history"). Saved prompts,
  documents and the account stay; token usage is kept for billing. The
  deletion is audit-logged (`user.history_deleted`). `@vivexy/core` adds
  `userService.deleteHistory` and `useDeleteMyHistory`.
- `queuePromptForChat(text, chatId)` can queue a prompt for an existing chat;
  the chat screen sends it if that chat has no messages yet. Products use it
  to open a new scoped chat with the user's question already sent.
- `NewAnalysisDialog` takes `lockKind`. `DocumentAnalysesScreen` sets it when
  given a `kind`, so a screen for one kind only starts that kind.

### Fixed

- Team retention now also deletes document analyses and workflow runs older
  than the retention period, not only chats. The maintenance audit entry
  counts each.
- Erasing a user also deletes their document analyses, workflow runs and
  personal prompts. Team prompts they wrote stay with the team.
- Starting a summary or timeline from the new-analysis dialog did nothing:
  the form's hidden, blank review question failed validation. Questions are
  now checked only for review grids.

## [0.5.0] - 2026-11-14

### Added

- Prompt library at `/api/prompts` and the Prompt Library page (`/prompts`):
  personal prompts, team prompts (shared with every member, managed by team
  admins) and built-in prompts. Prompts have fill-in fields written as
  `{{name}}` (short text, long text or a choice). Use one to fill in its
  fields, preview it and send it to a new chat in one click; copy any prompt
  to your own or, as an admin, to the team. Changes are audit-logged.
- Workflow runner at `/api/workflows` and the Workflows page (`/workflows`):
  guided multi-step runs over chosen documents. Steps either write from
  instructions, searching the documents and citing what they use, or run a
  review grid, summaries or a timeline. Steps marked to pause wait for the user
  to check them; any finished step can be edited or re-run, and the run
  continues from there. Runs execute on the `document_jobs` queue, record token
  usage, and export to Word with numbered sources.
- Extensions can add built-in prompts and workflows (`VivexyExtension.prompts`,
  `VivexyExtension.workflows`, using `agents_core.library` types) and hide
  Vivexy's own with `include_core_library=False`. Vivexy ships four general
  prompts and a "Document brief" workflow.

- Document analyses at `/api/analyses`, run in the background on the
  `document_jobs` queue (or in-process without RabbitMQ):
  - **Review grid**: ask up to 15 questions of up to 100 ready documents. Each
    cell is answered from that document's best passages and cites them, or
    says "Not found in this document". Questions can be added, reworded and
    re-run, or removed; failed cells can be retried.
  - **Summary**: a short or detailed summary of each of up to 20 documents,
    with every sentence cited.
  - **Timeline**: dated events, people and sources from up to 50 documents,
    merged and sorted.
  - Exports: review and timeline to Excel (with a Sources sheet), summary to
    Word with numbered sources. Creating, changing, exporting and deleting an
    analysis is audit-logged, and token usage is recorded against the team.
- Document Analyses page (`/analyses`, `@vivexy/core/screens/document-analyses`):
  upload documents, start a review, summary or timeline, watch cells fill in,
  sort and filter the grid, add, edit, re-run or remove columns, open any cited
  passage in the source viewer, and export. `DocumentAnalysesScreen` takes a
  scope and suggested questions so products can embed it.
- The API exposes `Content-Disposition` to browsers so downloads keep their names.
- `python -m agents_core.cli.make_review_test_set` writes 20 synthetic services
  agreements with known answers, and `python -m agents_core.cli.eval_document_analyses`
  scores a review grid against them.

### Fixed

- Chats scoped to a set of documents tell the agent which documents they
  hold and to search them before answering, instead of asking for uploads.
- `search_documents` accepts filenames as well as ids in `document_ids`.
- Grouped citation markers such as `[^a, ^b]` count as separate citations in
  the citation check, saved citations and the chat UI.
- The citation check sees the opening of each cited document, so a defined
  term ("the Customer") and the party it names count as the same.

### Upgrading

- Run the two new migrations (`alembic upgrade head`): document analyses, then
  prompts and workflow runs.
- Analyses and workflow runs share the `document_jobs` queue with document
  processing, so the document worker must run 0.5.0 as well. Without RabbitMQ
  they run inside the API process.
- The default navigation gains Document Analyses and Workflows (shown when the
  `rag` feature is on) and Prompt Library. Products with their own navigation
  add `ROUTES.analyses`, `ROUTES.workflows` and `ROUTES.prompts`, or embed
  `DocumentAnalysesScreen`, `WorkflowsScreen` and `PromptLibraryScreen` with a
  scope.
- Products can add built-in prompts and workflows with
  `VivexyExtension.prompts` and `VivexyExtension.workflows` (types in
  `agents_core.library`), and hide Vivexy's own with
  `include_core_library=False`.

## [0.4.0] - 2026-11-14

### Added

- Document store: `/api/documents` uploads PDF, DOCX, TXT, MD and EML files (ZIPs are
  unpacked) for a team or a user, up to 200 files and 100 MB per file by default.
  A background job on the new `document_jobs` queue extracts text page by page,
  runs Tesseract OCR on scanned PDF pages, splits pages into chunks with
  character offsets, embeds them locally with `BAAI/bge-small-en-v1.5` and stores
  the vectors in a per-team Pinecone namespace. Each document reports its status
  (`queued`, `processing`, `ready`, `failed`) and stage. Uploads, deletions and
  reprocessing are recorded in the audit log.
- `VivexyExtension.document_scope_authorizers`: products group documents under
  their own records (e.g. a legal matter) and decide who can access them.
- `WORKER_QUEUES` lets a worker consume only some queues, so document workers can
  run separately from chat workers.
- New dependencies `pypdfium2` and `pytesseract`. The agents-service image
  installs `tesseract-ocr` and bakes in the embedding model.
- Document search: `POST /api/documents/search` fuses Pinecone vector search
  with Postgres full-text search and re-checks every hit against the
  documents the user can read. The `document_store` tool group gives agents a
  `search_documents` tool (on for the default assistant); it searches the
  chat's team, or the scope a chat was created with (`documentScopeType` /
  `documentScopeId` on `POST /chat`).
- Cited answers: passages carry markers such as `[^1a2b3c4d]`. The stream emits
  a `citations` event with each passage's document, page and character span,
  saves the citations the answer used on the message (`citations`), then asks
  the chat's model whether each cited sentence is supported and emits and
  saves the result (`citation_check`).
- `python -m agents_core.cli.eval_document_search` reports hit rate and mean
  reciprocal rank for a JSONL file of queries with known answers.
- Citation UI in `@vivexy/core` chat: `[^id]` markers render as numbered
  footnotes in order of first use. A footnote opens a popover with the quote,
  file and page, and a source viewer that loads the page text and highlights
  the cited span. Sentences the citation check found unsupported are flagged,
  with a summary under the answer; markers that match no passage show as `?`.
  Answers list their sources, history reloads use `message.citations` and
  `message.citationCheck`, and copying an answer turns markers into `[1]`.
- `@vivexy/ui/popover`.

### Changed

- The `researcher` subagent searches the document store too, and citations
  from its searches reach the stream, so delegated document questions are
  cited and checked like direct ones. The assistant searches documents itself
  when it has `search_documents` and keeps citation markers from tool and
  subagent results.
- The legacy chat-attachment RAG tools are renamed `search_chat_files` and
  `hybrid_search_chat_files`, so they no longer share the `search_documents`
  name with the document store tool.

### Upgrading

- Run the two new migrations (`alembic upgrade head`): document tables, the
  chat document scope and message citations.
- Document search needs a Pinecone index (`DOCUMENT_PINECONE_INDEX`, default
  `rag-index`) with 384 dimensions, and `tesseract-ocr` wherever the document
  worker runs. The agents-service image includes both the OCR engine and the
  embedding model. S3-compatible storage such as Backblaze B2 or R2 needs
  `AWS_S3_ENDPOINT_URL`.
- Products that register document scopes add
  `VivexyExtension.document_scope_authorizers`; documents with an unregistered
  scope type are refused.

## [0.3.0] - 2026-10-20

### Added

- Frontend extension points: `AppConfigProvider` / `useAppConfig` let a product
  set the app name, logo, login-page copy, sidebar menu, agent catalogue and
  routes. Every page is available as `@vivexy/core/screens/*`, so a product's
  routes are one-line re-exports.
- `@vivexy/desktop`: the Electron app as a library (`createDesktopApp`,
  `exposeElectronAPI`) with a configurable data namespace and extra tools.
- Backend: `VivexyExtension.include_core_agents` and `default_agent_id` let a
  product offer only its own agents; `get_default_agent_id()` replaces the
  hardcoded `"assistant"`.
- Helm chart is published to `oci://ghcr.io/<owner>/charts/vivexy` with each
  release. New values: `partOf`, `nameOverride`, `agents.wsgiApp`,
  `agents.s3Region` and `migrations.commands`.
- `agents_core.cli`: `seed_llm_models`, `promote_superadmin` and
  `run_maintenance`, runnable as `python -m agents_core.cli.<name>`.
- `agents_core.flask_config.BaseConfig`, shared by the web app, worker and
  scheduler.

### Changed

- `AgentCategory` is a product-defined string instead of a fixed union.
- The root npm workspaces are listed explicitly; `@vivexy/desktop` is installed
  on its own because of Electron.

### Fixed

- Desktop: git commands no longer run through a shell, so `$()` and backticks in
  arguments can't execute.
- Desktop: workspace path checks no longer accept a sibling folder with the same
  prefix (e.g. `/ws-evil` for `/ws`).

### Upgrading

Downstream products can run their own migrations from the Helm chart with
`migrations.commands`. Products that deployed from vivexy's chart need no changes.

## [0.2.0] - 2026-10-20

### Added

- Community health files (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR
  templates).
- Extension registry (`agents_core.extensions`) so downstream products can add
  tools, agents, endpoints, tables and skills without forking. See
  `docs/EXTENDING.md`.
- Contributor License Agreement (`CLA.md`) enforced on pull requests by a CLA
  bot.
- `@vivexy/core`, `@vivexy/ui` and `vivexy-agents-core` are publishable and
  released together at one shared version, with a release workflow for npm and
  PyPI.
- `packages/agents-core/constraints.txt`: the exact dependency versions vivexy is
  tested with, for downstream products to apply as uv constraints.

### Changed

- Alembic migrations moved into the `agents_core` package. Revision IDs are
  unchanged, so no database change is needed for existing deployments.
- Flask configuration is shared with downstream products via
  `agents_core.flask_config`.
- `agents-core` now depends on `alembic` and caps SQLAlchemy below 2.1.

### Removed

- Stopped tracking the local Redis dump (`dump.rdb`); Redis dumps are now
  git-ignored.

## [0.1.0] - 2025

### Added

- Initial monorepo: Next.js frontend, Flask-based agents service, Electron
  desktop app, Kubernetes/Helm deployment infrastructure.
