// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createApp } = require('../app.cjs')
const { hashPassword } = require('../security.cjs')

const seededPasswordHash = hashPassword('Senhaforte1!', 'vitest-seed')

function createInMemoryUserRepository(seedUsers = []) {
  const users = [...seedUsers]

  return {
    async init() {},
    async findByToken(token) {
      return users.find((user) => user.sessionToken === token) || null
    },
    async findByRegistration(registration) {
      return users.find((user) => user.registration === registration) || null
    },
    async findByEmail(email) {
      return users.find((user) => user.email === email) || null
    },
    async create(user) {
      users.push(user)
      return user
    },
    async updateById(id, updater) {
      const index = users.findIndex((user) => user.id === id)
      if (index === -1) return null
      const current = users[index]
      users[index] = typeof updater === 'function' ? updater(current) : updater
      return users[index]
    },
    async updateByToken(token, updater) {
      const existing = users.find((user) => user.sessionToken === token)
      if (!existing) return null
      return this.updateById(existing.id, updater)
    },
    getUsers() {
      return users
    },
  }
}

function createSeedUser(progress = { cc: ['CC101', 'CC102'] }) {
  return {
    id: 'user-1',
    name: 'Lucas Oliveira',
    username: 'lucas',
    registration: '2026000001',
    email: 'lucas@universidade.edu.br',
    courseId: 'cc',
    avatarUrl: '',
    passwordHash: seededPasswordHash,
    sessionToken: 'token-1',
    preferences: { theme: 'brand' },
    progress,
  }
}

function createInMemoryCurriculumRepository(seedCurriculums = []) {
  const curriculums = [...seedCurriculums]

  return {
    async init() {},
    async list() {
      return [...curriculums]
    },
    async findById(id) {
      return curriculums.find((curriculum) => curriculum.id === id) || null
    },
    async upsert(curriculum) {
      const index = curriculums.findIndex((item) => item.id === curriculum.id)
      if (index === -1) {
        curriculums.push(curriculum)
      } else {
        curriculums[index] = curriculum
      }
      return curriculum
    },
  }
}

describe('backend app routes', () => {
  let repo
  let curriculumRepository
  let app

  beforeEach(() => {
    repo = createInMemoryUserRepository([createSeedUser()])
    curriculumRepository = createInMemoryCurriculumRepository()

    app = createApp({
      curriculumRepository,
      userRepository: repo,
      config: { storageDriver: 'file', openaiApiKey: '' },
      emailDomainValidator: async () => true,
    })
  })

  it('responde health e lista curriculos', async () => {
    const health = await request(app).get('/api/health')
    const curriculums = await request(app).get('/api/curriculums')

    expect(health.status).toBe(200)
    expect(health.body.ok).toBe(true)
    expect(curriculums.status).toBe(200)
    expect(curriculums.body.length).toBeGreaterThan(0)
    expect(curriculums.body[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      totalSubjects: expect.any(Number),
    }))
    expect(health.headers['x-content-type-options']).toBe('nosniff')
    expect(health.headers['x-frame-options']).toBe('DENY')
  })

  it('registra usuario novo e faz login', async () => {
    const register = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Ana Segura',
        registration: '2026999999',
        email: 'ana@universidade.edu.br',
        password: 'Senhaforte1!',
        courseId: 'cc',
      })

    expect(register.status).toBe(201)
    expect(register.body.user.email).toBe('ana@universidade.edu.br')
    expect(repo.getUsers().some((user) => user.registration === '2026999999')).toBe(true)

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        registration: '2026999999',
        password: 'Senhaforte1!',
      })

    expect(login.status).toBe(200)
    expect(login.body.token).toBeTruthy()
    expect(login.body.user.name).toBe('Ana Segura')
  })

  it('retorna erro para login invalido e sessao ausente', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({
        registration: '2026000001',
        password: 'SenhaErrada1!',
      })

    const me = await request(app).get('/api/auth/me')

    expect(login.status).toBe(401)
    expect(me.status).toBe(401)
  })

  it('atualiza perfil autenticado', async () => {
    const response = await request(app)
      .patch('/api/profile')
      .set('Authorization', 'Bearer token-1')
      .send({
        name: 'Lucas Seguro',
        username: 'lucasseguro',
        email: 'novo@universidade.edu.br',
        avatarUrl: '',
        theme: 'dark',
      })

    expect(response.status).toBe(200)
    expect(response.body.user.name).toBe('Lucas Seguro')
    expect(response.body.user.preferences.theme).toBe('dark')
  })

  it('gera mapa e atualiza progresso de disciplina disponivel', async () => {
    const map = await request(app)
      .get('/api/map?courseId=cc')
      .set('Authorization', 'Bearer token-1')

    expect(map.status).toBe(200)
    expect(map.body.subjects.length).toBeGreaterThan(0)

    const toggle = await request(app)
      .post('/api/progress/toggle')
      .set('Authorization', 'Bearer token-1')
      .send({
        courseId: 'cc',
        subjectId: 'CC201',
        completed: true,
      })

    expect(toggle.status).toBe(200)
    expect(toggle.body.subjects.find((subject) => subject.id === 'CC201').status).toBe('completed')
  })

  it('bloqueia desfazer disciplina com dependentes concluidos', async () => {
    repo = createInMemoryUserRepository([
      createSeedUser({ cc: ['CC101', 'CC102', 'CC201', 'CC301'] }),
    ])

    app = createApp({
      curriculumRepository,
      userRepository: repo,
      config: { storageDriver: 'file', openaiApiKey: '' },
      emailDomainValidator: async () => true,
    })

    const response = await request(app)
      .post('/api/progress/toggle')
      .set('Authorization', 'Bearer token-1')
      .send({
        courseId: 'cc',
        subjectId: 'CC201',
        completed: false,
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('CC301')
  })

  it('importa uma grade em JSON e a devolve na lista de curriculos', async () => {
    const response = await request(app)
      .post('/api/curriculums/import')
      .set('Authorization', 'Bearer token-1')
      .send({
        fileName: 'grade-importada.json',
        sourceText: JSON.stringify({
          code: 'ADS',
          name: 'Analise e Desenvolvimento de Sistemas 2025',
          academicYear: 2025,
          versionLabel: 'Matriz 2025',
          trailLabels: ['Backend', 'Frontend'],
          subjects: [
            { id: 'ADS101', name: 'Algoritmos', semester: 1, trail: 'Base', prerequisites: [], corequisites: [] },
            { id: 'ADS201', name: 'APIs Web', semester: 2, trail: 'Backend', prerequisites: ['ADS101'], corequisites: [] },
          ],
        }),
      })

    expect(response.status).toBe(201)
    expect(response.body.curriculum.name).toContain('Analise')
    expect(response.body.curriculum.academicYear).toBe(2025)
    expect(response.body.curriculum.versionLabel).toBe('Matriz 2025')
    expect(response.body.curriculums.some((curriculum) => curriculum.code === 'ADS')).toBe(true)
    expect(response.body.curriculums.some((curriculum) => curriculum.catalogKey === 'ads')).toBe(true)
  })
})
