# Coding patterns and rules to follow

This document provides architectural context, codebase patterns, and constraints for AI agents (like yourself) working in this monorepo. Please read and adhere to these guidelines before making changes or proposing solutions.

## 🏗️ Architecture & Monorepo Structure

- **Turborepo** monorepo managing `apps/frontend` (Next.js) and `apps/agents-service` (Flask/Python).
- **Frontend (`apps/frontend`)**: Next.js 16 (App Router), React 19, TypeScript, TailwindCSS v4, shadcn/ui, @tanstack/react-query, zod, sonner, tw-animate-css, framer-motion, lucide-react.
- **Desktop (`apps/desktop`)**: Electron, React 19, TypeScript, TailwindCSS v4.
- **Backend (`apps/agents-service`)**: Flask, Python 3.11+, SQLAlchemy, Alembic for database migrations, LangGraph/LangChain for AI agent logic, Redis, Postgresql for databases.
- **Infrastructure**: Docker and Kubernetes configurations exist in the `infra/` directory.

---

## 🎨 UI & Frontend Patterns (Next.js)

1. **Styling & Components**:
   - Uses **TailwindCSS v4**. Do not add inline styles unless necessary; prefer Tailwind utility classes.
   - UI components are built with **Shadcn UI** primitives and follow a structure similar to `shadcn/ui` (located in `apps/frontend/components/ui/`).
   - Use `lucide-react` for icons.
   - Use `framer-motion` for complex animations, and `tw-animate-css` for simpler CSS keyframes.

2. **State & Data Fetching**:
   - Use `@tanstack/react-query` (v5) for API state management, data fetching, mutations, and caching. Hooks are kept in apps/frontend/hooks folder. They may call api calling services in apps/frontend/services folder with axiosInstance.
   - For form handling and validation, always pair `react-hook-form` with `zod` (`@hookform/resolvers/zod`).
   - For function initialisation, always use ES6 arrow functions and not function declarations.

3. **Theming & Accessibility**:
   - Supports dark mode via `next-themes`. Ensure you use proper Tailwind classes (e.g., `dark:bg-slate-900`, `dark:text-white`) to maintain accessibility and contrast.
   - Use `sonner` for toast notifications and user feedback.

---

## 🖥️ Desktop Patterns (Electron)

1. **Architecture Overview**:
   - The desktop app (`apps/desktop`) acts as a wrapper around the Next.js frontend or connects to the same backend.
   - It is built using Electron, TypeScript, and React 19.
   - Core files: `main.ts` (Main Process), `preload.ts` (Context Bridge), and `tools/` (Local capabilities).

2. **Local Capabilities & Agents Context**:
   - The Desktop app provides the agents with local file system access and data processing tools.
   - Uses `better-sqlite3` for local database needs, and libraries like `pdf-parse`, `csv-parse`, and `xlsx` for parsing local files on the user's machine.
   - Agents can offload heavy local data handling or sensitive file reading to these Electron-based tools through IPC.

3. **IPC (Inter-Process Communication)**:
   - Always use `preload.ts` to expose safe, strongly-typed APIs to the React renderer via `contextBridge`.
   - The renderer should trigger local operations via these bridged functions rather than using Node.js modules directly in the frontend.

---

## ⚙️ Backend Patterns (Flask & Python)

1. **API Structure (Blueprints)**:
   - Built with a clean architecture in mind. Route definitions belong in `app/routes/` and should primarily handle HTTP requests/responses.
   - All core logic, database interactions, and complex workflows MUST be pushed down to the `app/business_logic/` layer.
   - Use Pydantic schemas (`app/schemas/`) for data validation at the API boundaries before hitting the database or business logic.
   - Keep the imports at top of the file and not between the functions

2. **Database & ORM**:
   - Always use SQLAlchemy models (defined in `app/models/`) and `db.session` for database interactions.
   - **MIGRATIONS**: All DB schema changes MUST be accompanied by an Alembic migration. Run:
     `uv run alembic revision --autogenerate -m "description"` to create one.

3. **Config & Constants (agents-service)**:
   - **Config**: All env-derived settings live under `configs/` (Flask config in `configs/flask_config.py`, worker/broker in `configs/worker_config.py`). Import via `from configs import Config, REDIS_URL, CHAT_QUEUE`, etc.
   - **Constants**: Redis key/channel patterns and queue names live in `app/constants/` (`redis_keys.py`, `queues.py`, `stream_events.py`). Use these so keys and queue names stay consistent and scalable.

4. **AI Agents & LangChain**:
   - LangChain/LangGraph is strictly used for agentic workflows in `app/agents/`.
   - Conversational state is persisted via database models such as `Chat`, `Message`, `Artifact`, `ChatAttachment`, and `Todo`.
   - Tool implementations are located in `app/tools/` and dynamically injected into the agent's context.

5. **Streaming (Server-Sent Events)**:
   - Real-time agent responses and status updates are streamed via SSE (see `app/routes/chat.py` POST `/stream`).
   - The stream returns structured JSON blobs with specific event types (e.g., `start`, `content`, `reasoning`, `artifact`, `done`, `error`) and should not be disrupted.

---

## 🛠️ Tooling & Standards

- **Dependency Management**: Root runs `npm run install:all`. The Python backend explicitly relies on `uv` for managing virtual environments and dependencies.
- **Formatting and Linting** (Strictly Enforced):
  - **JavaScript/TypeScript**: Run `npm run format` (Prettier) and `npm run lint` (ESLint).
  - **Python**: Must align with `black`, `isort`, and `flake8`.
    ```bash
    cd apps/agents-service
    uv run black .
    uv run isort .
    uv run flake8 .
    ```
  - But running `npm run format` in the root folder should format the code across the apps.
  - In agents-service, keep 1 line spacings between functions instead of 2 and keep all the imports at top of the file and not in between the file.
  - Don't add too many comments, only add comments if really required for future references.
  - Use descriptive variable names like queryClient instead of qc.
- **Execution**:
  - Do not use global `pip`; always execute backend scripts with `uv run python <script>`.
  - Always check `package.json` for custom lifecycle scripts before running manual builds.
