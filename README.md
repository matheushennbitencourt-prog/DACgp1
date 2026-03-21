# CourseMapper

Sistema local para planejamento academico com:

- cadastro e login por matricula
- curriculos de Ciencia da Computacao e Sistemas de Informacao
- persistencia alternavel entre arquivo JSON local e PostgreSQL
- calculo automatico de disciplinas disponiveis
- destaque de caminho critico e estimativa de semestres restantes

## Requisitos

- Node.js 20+ recomendado
- npm 10+ recomendado

## Como rodar

Instale as dependencias:

```bash
npm install
```

Opcionalmente, crie um usuario demo:

```bash
npm run seed
```

Suba frontend e backend juntos:

```bash
npm run dev:all
```

Aplicacao frontend:

- `http://localhost:5173`

API local:

- `http://localhost:3001/api/health`

## Scripts uteis

- `npm run dev`: sobe apenas o frontend Vite
- `npm run backend`: sobe apenas o backend Express com watch
- `npm run dev:all`: sobe frontend e backend juntos
- `npm run seed`: cria um usuario demo local
- `npm run build`: gera build de producao
- `npm run lint`: valida o frontend com ESLint

## Persistencia local

Os usuarios e o progresso ficam salvos em:

- `backend/data/users.json`

## Persistencia com PostgreSQL

O backend agora aceita 2 drivers:

- `STORAGE_DRIVER=file`
- `STORAGE_DRIVER=postgres`

Para usar PostgreSQL:

1. Crie um banco, por exemplo `coursemapper`.
2. Ajuste o `.env`:

```bash
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coursemapper
```

3. Suba o backend normalmente com:

```bash
npm run backend
```

O schema de PostgreSQL fica em:

- `backend/sql/schema.postgres.sql`

Observacao:

- o repositório PostgreSQL executa esse schema automaticamente na inicializacao
- o script `npm run seed` funciona tanto em `file` quanto em `postgres`

## Observacoes

- O frontend usa proxy do Vite para `/api`, apontando para `http://localhost:3001`.
- Para resetar o ambiente local, basta limpar o arquivo `backend/data/users.json`.
- O backend carrega configuracoes do arquivo `.env`.

## Deploy externo

Stack recomendada:

- frontend: Vercel
- backend: Render
- banco: Neon

Alternativa pronta neste repositório:

- frontend: GitHub Pages via GitHub Actions
- backend: Render

### Backend no Render

O projeto ja inclui:

- `render.yaml`

Variaveis importantes no Render:

- `PORT=10000`
- `STORAGE_DRIVER=file` para subir rapido sem banco
- ou `STORAGE_DRIVER=postgres` com `DATABASE_URL=...` quando o Postgres estiver validado

Health check:

- `/api/health`

### Frontend na Vercel

O projeto ja inclui:

- `vercel.json`

Defina na Vercel a variavel:

```bash
VITE_API_BASE_URL=https://SEU-BACKEND.onrender.com/api
```

Observacao:

- em ambiente externo o frontend nao faz fallback para `localhost`, entao o `VITE_API_BASE_URL` precisa apontar para a URL publica da API

### Frontend no GitHub Pages

O projeto agora inclui o workflow:

- `.github/workflows/deploy-pages.yml`

Esse workflow publica automaticamente o frontend no GitHub Pages a cada push na branch `main`, usando:

- `VITE_API_BASE_URL=https://dacgp1.onrender.com/api`
- `VITE_BASE_PATH=/DACgp1/`

URL esperada do frontend publicado:

- `https://matheushennbitencourt-prog.github.io/DACgp1/`

Se o Pages ainda nao estiver ativo no repositorio, basta habilitar:

1. GitHub repository `Settings`
2. `Pages`
3. Source/Build via `GitHub Actions`

## Usuario demo

Depois de rodar `npm run seed`, voce pode entrar com:

- matricula: `2026000001`
- senha: `1234`

## Camada de persistencia

Arquivos principais:

- `backend/repositories/fileUserRepository.cjs`
- `backend/repositories/postgresUserRepository.cjs`
- `backend/repositories/index.cjs`

Com isso, a API continua igual para o frontend e so a camada de persistencia muda via `.env`.
