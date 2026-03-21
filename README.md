# CourseMapper

Sistema local para planejamento academico com:

- cadastro e login por matricula
- curriculos de Ciencia da Computacao e Sistemas de Informacao
- progresso persistido em arquivo JSON local
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

## Observacoes

- O frontend usa proxy do Vite para `/api`, apontando para `http://localhost:3001`.
- Para resetar o ambiente local, basta limpar o arquivo `backend/data/users.json`.
- O backend carrega configuracoes do arquivo `.env`.

## Usuario demo

Depois de rodar `npm run seed`, voce pode entrar com:

- matricula: `2026000001`
- senha: `1234`

## Como vincular ao banco

Hoje o projeto usa um repositorio de arquivo local em:

- `backend/repositories/fileUserRepository.cjs`

O backend ja esta preparado para trocar isso por outro driver via:

- `backend/repositories/index.cjs`
- `.env` com `STORAGE_DRIVER`

Para migrar para PostgreSQL:

1. Criar o banco e executar o schema em [backend/sql/schema.postgres.sql](c:/Users/dacathon/Desktop/DAC/backend/sql/schema.postgres.sql#L1).
2. Instalar um client, como `pg`.
3. Criar um novo repositorio, por exemplo `backend/repositories/postgresUserRepository.cjs`, implementando os mesmos metodos do repositorio de arquivo:
   `init`, `findByToken`, `findByRegistration`, `findByEmail`, `create`, `updateById`, `updateByToken`.
4. Alterar `backend/repositories/index.cjs` para retornar o repositorio PostgreSQL quando `STORAGE_DRIVER=postgres`.
5. Definir `DATABASE_URL` no `.env`.

Com isso, a API continua igual para o frontend e so a camada de persistencia muda.
