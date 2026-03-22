// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  assertSecureRuntimeConfig,
  createCorsOriginValidator,
  getPasswordSecurityMessage,
  hashPassword,
  isAllowedOrigin,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} = require('../security.cjs')

describe('security helpers', () => {
  it('normaliza e valida e-mails corretamente', () => {
    expect(normalizeEmail('  Lucas@Universidade.edu.br ')).toBe('lucas@universidade.edu.br')
    expect(isValidEmail('lucas@universidade.edu.br')).toBe(true)
    expect(isValidEmail('lucas@localhost')).toBe(false)
    expect(isValidEmail('lucas@@universidade.edu.br')).toBe(false)
  })

  it('aplica politica forte de senha', () => {
    expect(getPasswordSecurityMessage('123')).toBe('A senha deve ter pelo menos 8 caracteres.')
    expect(getPasswordSecurityMessage('senhaforte1!')).toBe('A senha deve incluir pelo menos uma letra maiuscula.')
    expect(getPasswordSecurityMessage('SENHAFORTE1!')).toBe('A senha deve incluir pelo menos uma letra minuscula.')
    expect(getPasswordSecurityMessage('Senhaforte!')).toBe('A senha deve incluir pelo menos um numero.')
    expect(getPasswordSecurityMessage('Senhaforte1')).toBe('A senha deve incluir pelo menos um caractere especial.')
    expect(getPasswordSecurityMessage('Senha forte1!')).toBe('A senha nao pode conter espacos.')
    expect(getPasswordSecurityMessage('Senhaforte1!')).toBe('')
  })

  it('gera hash e verifica senha sem expor o valor original', () => {
    const hash = hashPassword('Senhaforte1!')

    expect(hash).not.toContain('Senhaforte1!')
    expect(verifyPassword('Senhaforte1!', hash)).toBe(true)
    expect(verifyPassword('Senhaerrada1!', hash)).toBe(false)
  })

  it('valida configuracao segura em producao', () => {
    expect(() => assertSecureRuntimeConfig({
      isProduction: true,
      storageDriver: 'file',
      databaseUrl: '',
      allowedOrigins: [],
    })).toThrow('STORAGE_DRIVER=postgres')

    expect(() => assertSecureRuntimeConfig({
      isProduction: true,
      storageDriver: 'postgres',
      databaseUrl: 'postgresql://example',
      allowedOrigins: ['https://app.example.com'],
    })).not.toThrow()
  })

  it('limita origens permitidas no cors', async () => {
    expect(isAllowedOrigin('', ['https://app.example.com'])).toBe(true)
    expect(isAllowedOrigin('https://app.example.com', ['https://app.example.com'])).toBe(true)
    expect(isAllowedOrigin('https://evil.example.com', ['https://app.example.com'])).toBe(false)

    const validator = createCorsOriginValidator({
      isProduction: true,
      allowedOrigins: ['https://app.example.com'],
    })

    await expect(new Promise((resolve, reject) => {
      validator('https://app.example.com', (error, allowed) => {
        if (error) reject(error)
        else resolve(allowed)
      })
    })).resolves.toBe(true)

    await expect(new Promise((resolve, reject) => {
      validator('https://evil.example.com', (error, allowed) => {
        if (error) reject(error)
        else resolve(allowed)
      })
    })).rejects.toThrow('Origem nao autorizada')
  })
})
