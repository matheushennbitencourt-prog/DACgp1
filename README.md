# CourseMapper

CourseMapper is a full-stack academic planning app for university students. It lets the user register, log in, view a curriculum map, track completed subjects, analyze progress, and personalize the dashboard theme.

The project has:

- a React + Vite frontend
- an Express backend
- support for local JSON persistence or PostgreSQL/Neon
- automated tests for frontend and backend

## Features

- authentication with registration number and password
- curriculum visualization by semester
- progress tracking with prerequisite validation
- "next subjects" and critical path indicators
- user profile settings with persisted theme
- deploy-ready setup for Vercel, Render, and GitHub Pages

## Tech Stack

Frontend:

- React 19
- Vite
- React Router
- Testing Library
- Vitest

Backend:

- Node.js
- Express
- CORS
- Compression

Persistence:

- local JSON file
- PostgreSQL
- Neon serverless driver support

## Project Structure

```text
.
|-- backend/
|   |-- app.cjs
|   |-- server.cjs
|   |-- config.cjs
|   |-- security.cjs
|   |-- seed.cjs
|   |-- data/
|   |-- repositories/
|   |-- services/
|   |-- sql/
|   `-- tests/
|-- src/
|   |-- App.jsx
|   |-- App.css
|   |-- app-utils.js
|   |-- main.jsx
|   |-- pages/
|   |-- utils/
|   `-- *.test.jsx
|-- test/
|-- public/
|-- .env.example
|-- render.yaml
|-- vercel.json
|-- vite.config.js
|-- vitest.config.js
`-- README.md
```

## Main Flows

Frontend:

- login and registration screen
- dashboard with overview, curriculum, board, analytics, and settings pages
- token and theme persistence via `localStorage`
- API fallback to local backend in development when needed

Backend:

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/curriculums`
- `/api/map`
- `/api/profile`
- `/api/progress/toggle`
- `/api/health`

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended

## Environment Variables

Copy `.env.example` to `.env` and adjust if needed.

Example:

```bash
APP_ENV=development
PORT=3001
VITE_API_BASE_URL=/api
STORAGE_DRIVER=postgres
USERS_FILE=backend/data/users.json
IMPORTED_CURRICULUMS_FILE=backend/data/imported-curriculums.json
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coursemapper
ALLOWED_ORIGINS=http://localhost:5173
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
```

Description:

- `PORT`: backend port
- `VITE_API_BASE_URL`: frontend API base URL
- `APP_ENV`: `development` or `production`
- `STORAGE_DRIVER`: `file` or `postgres`
- `USERS_FILE`: JSON database path when using file storage
- `IMPORTED_CURRICULUMS_FILE`: JSON database path for imported curriculums when using file storage
- `DATABASE_URL`: PostgreSQL connection string
- `ALLOWED_ORIGINS`: comma-separated list of allowed frontend origins for CORS
- `OPENAI_API_KEY`: required for PDF/DOCX or unstructured curriculum imports
- `OPENAI_MODEL`: OpenAI model used by curriculum import

## Installation

```bash
npm install
```

## Running Locally

Run frontend and backend together:

```bash
npm run dev:all
```

Run only the frontend:

```bash
npm run dev
```

Run only the backend:

```bash
npm run backend
```

Default local URLs:

- frontend: `http://localhost:5173`
- backend health check: `http://localhost:3001/api/health`

## Demo User

Create or update the demo user:

```bash
npm run seed
```

Credentials:

- registration: `2026000001`
- password: `Demo@2026`

## Available Scripts

- `npm run dev`: starts the frontend with Vite
- `npm run backend`: starts the Express backend in watch mode
- `npm run dev:all`: runs frontend and backend together
- `npm run seed`: creates or refreshes the demo user
- `npm run build`: creates the production frontend build
- `npm run preview`: previews the production build locally
- `npm run lint`: runs ESLint
- `npm test`: runs the automated test suite
- `npm run test:watch`: runs Vitest in watch mode

## Persistence Modes

### File Storage

Use:

```bash
STORAGE_DRIVER=file
```

Data is stored in:

- `backend/data/users.json`

This is the fastest option for local development.

### PostgreSQL / Neon

Use:

```bash
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coursemapper
```

Relevant files:

- `backend/repositories/postgresUserRepository.cjs`
- `backend/sql/schema.postgres.sql`

The backend initializes the schema automatically when the PostgreSQL repository starts.

## Security Notes

- passwords are hashed with `scrypt`
- registration validates password strength
- email addresses are normalized before persistence
- profile updates validate email and allowed themes
- session access is protected through bearer token authentication
- production blocks `STORAGE_DRIVER=file` and requires `ALLOWED_ORIGINS`
- API responses use hardened headers like `X-Frame-Options`, `Referrer-Policy`, and `HSTS` in production
- imported PDF and DOCX files are restricted by MIME type and size before parsing

## Testing

Run all tests:

```bash
npm test
```

The repository includes:

- backend tests in `backend/tests/`
- frontend tests in `src/*.test.jsx`
- utility tests in `src/utils/`

## Architecture Notes

Backend service split:

- `backend/app.cjs`: app factory and route wiring
- `backend/services/curriculumCatalog.cjs`: curriculum catalog/indexing
- `backend/services/mapService.cjs`: curriculum map payload building
- `backend/services/progressService.cjs`: subject completion rules
- `backend/repositories/`: storage layer abstraction

Frontend organization:

- `src/App.jsx`: app shell and route flow
- `src/pages/BoardPage.jsx`: board visualization
- `src/app-utils.js`: dashboard formatting and helper logic
- `src/utils/authValidation.js`: credential validation helpers

## Deploy

### Render

The repository includes:

- `render.yaml`

Recommended environment values:

```bash
APP_ENV=production
PORT=10000
STORAGE_DRIVER=postgres
ALLOWED_ORIGINS=https://YOUR-FRONTEND.vercel.app
```

Required secrets in Render:

```bash
DATABASE_URL=...
OPENAI_API_KEY=...
```

Health check:

- `/api/health`

### Vercel

The repository includes:

- `vercel.json`

Set:

```bash
VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com/api
```

### GitHub Pages

The repository includes:

- `.github/workflows/deploy-pages.yml`

The workflow builds the frontend on every push to `main`.

## Troubleshooting

- If the frontend receives HTML instead of JSON, make sure the backend is running and `VITE_API_BASE_URL` is correct.
- If the backend fails with PostgreSQL, confirm `DATABASE_URL` and the selected `STORAGE_DRIVER`.
- If you want to reset local file storage, clear `backend/data/users.json`.

## Status

This project is ready for local development, automated testing, and production deployment of frontend and backend separately.
