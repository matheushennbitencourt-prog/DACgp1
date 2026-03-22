// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseCurriculumSource } = require('../services/curriculumImportService.cjs')

describe('curriculum import service', () => {
  it('normaliza metadados de versao e remove referencias invalidas', async () => {
    const curriculum = await parseCurriculumSource({
      fileName: 'cc-2024.json',
      sourceText: JSON.stringify({
        code: 'CC',
        name: 'Ciencia da Computacao 2024',
        academicYear: 2024,
        versionLabel: 'Matriz 2024',
        subjects: [
          { id: 'CC101', name: 'Algoritmos I', semester: 1, trail: 'Base', prerequisites: [], corequisites: [] },
          { id: 'CC201', name: 'Algoritmos II', semester: 2, trail: 'Base', prerequisites: ['CC101', 'INEXISTE'], corequisites: ['CC201'] },
        ],
      }),
    })

    expect(curriculum.id).toBe('cc-2024')
    expect(curriculum.catalogKey).toBe('cc')
    expect(curriculum.name).toBe('Ciencia da Computacao')
    expect(curriculum.academicYear).toBe(2024)
    expect(curriculum.versionLabel).toBe('Matriz 2024')
    expect(curriculum.subjects[1].prerequisites).toEqual(['CC101'])
    expect(curriculum.subjects[1].corequisites).toEqual([])
  })

  it('aceita DOCX extraindo texto antes da normalizacao', async () => {
    const docxTextExtractor = vi.fn().mockResolvedValue([
      'id,name,semester,trail,prerequisites,corequisites',
      'ADS101,Algoritmos,1,Base,,',
      'ADS201,APIs Web,2,Backend,ADS101,',
    ].join('\n'))

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,RG9jeA==',
        fileName: 'ads-2025.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      { docxTextExtractor },
    )

    expect(docxTextExtractor).toHaveBeenCalledTimes(1)
    expect(curriculum.baseCode).toBe('IMPORTADA')
    expect(curriculum.subjects).toHaveLength(2)
    expect(curriculum.subjects[1].prerequisites).toEqual(['ADS101'])
  })

  it('envia PDF para a OpenAI quando o conteudo precisa ser estruturado', async () => {
    const openaiClient = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            code: 'SI',
            name: 'Sistemas de Informacao 2023',
            academicYear: 2023,
            subjects: [
              { id: 'SI101', name: 'Fundamentos', semester: 1, trail: 'Base', prerequisites: [], corequisites: [] },
              { id: 'SI201', name: 'Modelagem', semester: 2, trail: 'Analista', prerequisites: ['SI101'], corequisites: [] },
            ],
            trailLabels: ['Analista'],
          }),
        }),
      },
    }

    const curriculum = await parseCurriculumSource(
      {
        fileData: 'data:application/pdf;base64,JVBERi0x',
        fileName: 'si-2023.pdf',
        mimeType: 'application/pdf',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-5-mini',
      },
      { openaiClient },
    )

    expect(openaiClient.responses.create).toHaveBeenCalledTimes(1)
    expect(openaiClient.responses.create.mock.calls[0][0].input[0].content.some((item) => item.type === 'input_file')).toBe(true)
    expect(curriculum.catalogKey).toBe('si')
    expect(curriculum.academicYear).toBe(2023)
    expect(curriculum.subjects[1].prerequisites).toEqual(['SI101'])
  })
})
