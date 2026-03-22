const crypto = require('crypto');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const curriculumSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'code', 'trailLabels', 'subjects'],
  properties: {
    id: { type: 'string' },
    code: { type: 'string' },
    name: { type: 'string' },
    trailLabels: {
      type: 'array',
      items: { type: 'string' },
    },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'semester', 'trail', 'prerequisites', 'corequisites'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          semester: { type: 'integer' },
          trail: { type: 'string' },
          prerequisites: {
            type: 'array',
            items: { type: 'string' },
          },
          corequisites: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[|,;/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeSubject(subject, index) {
  return {
    id: String(subject.id || `SUBJ${index + 1}`).trim().toUpperCase(),
    name: String(subject.name || `Disciplina ${index + 1}`).trim(),
    semester: Math.max(1, Number(subject.semester || 1)),
    trail: String(subject.trail || 'Base').trim() || 'Base',
    prerequisites: normalizeList(subject.prerequisites).map((item) => item.toUpperCase()),
    corequisites: normalizeList(subject.corequisites).map((item) => item.toUpperCase()),
  };
}

function normalizeCurriculum(parsedCurriculum) {
  const subjects = Array.isArray(parsedCurriculum.subjects)
    ? parsedCurriculum.subjects.map((subject, index) => sanitizeSubject(subject, index))
    : [];

  if (subjects.length === 0) {
    throw new Error('Nenhuma disciplina valida foi encontrada na grade enviada.');
  }

  const uniqueTrails = [...new Set(subjects.map((subject) => subject.trail).filter((trail) => trail !== 'Base'))];
  const fallbackCode = String(parsedCurriculum.code || parsedCurriculum.id || parsedCurriculum.name || 'CURSO').trim().toUpperCase();
  const id = slugify(parsedCurriculum.id || parsedCurriculum.code || parsedCurriculum.name) || crypto.randomUUID();

  return {
    id,
    code: fallbackCode.slice(0, 16),
    name: String(parsedCurriculum.name || parsedCurriculum.code || 'Grade importada').trim(),
    trailLabels: normalizeList(parsedCurriculum.trailLabels).filter((trail) => trail !== 'Base').length > 0
      ? normalizeList(parsedCurriculum.trailLabels).filter((trail) => trail !== 'Base')
      : uniqueTrails,
    subjects,
  };
}

function tryParseJson(sourceText) {
  try {
    return JSON.parse(sourceText);
  } catch {
    return null;
  }
}

function tryParseDelimited(sourceText) {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((item) => item.trim().toLowerCase());
  const requiredHeaders = ['id', 'name', 'semester', 'trail'];

  if (!requiredHeaders.every((header) => headers.includes(header))) {
    return null;
  }

  const rows = lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = values[index] || '';
      return accumulator;
    }, {});
  });

  return {
    code: 'IMPORTADA',
    name: 'Grade importada',
    trailLabels: [...new Set(rows.map((row) => row.trail).filter((trail) => trail && trail !== 'Base'))],
    subjects: rows.map((row) => ({
      id: row.id,
      name: row.name,
      semester: Number(row.semester),
      trail: row.trail || 'Base',
      prerequisites: normalizeList(row.prerequisites),
      corequisites: normalizeList(row.corequisites),
    })),
  };
}

function extractStructuredText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const outputBlocks = Array.isArray(payload.output) ? payload.output : [];

  for (const block of outputBlocks) {
    const contents = Array.isArray(block.content) ? block.content : [];

    for (const content of contents) {
      if (typeof content.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }

  return '';
}

async function parseWithOpenAI({ sourceText, fileName, openaiApiKey, openaiModel }) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Converta a grade curricular enviada para JSON valido. Preserve codigos, nomes, semestre, trilha, pre-requisitos e correquisitos.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Arquivo: ${fileName || 'grade.txt'}\n\nConteudo:\n${sourceText}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'curriculum_import',
          schema: curriculumSchema,
          strict: true,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Falha ao processar a grade com a OpenAI API.');
  }

  const structuredText = extractStructuredText(payload);

  if (!structuredText) {
    throw new Error('A OpenAI API nao retornou uma grade estruturada.');
  }

  return JSON.parse(structuredText);
}

async function parseCurriculumSource({
  fileName = '',
  openaiApiKey = '',
  openaiModel = 'gpt-4o-mini',
  sourceText = '',
}) {
  const normalizedSource = String(sourceText || '').trim();

  if (!normalizedSource) {
    throw new Error('Envie o conteudo textual da grade curricular.');
  }

  const jsonPayload = tryParseJson(normalizedSource);
  if (jsonPayload) {
    return normalizeCurriculum(jsonPayload);
  }

  const delimitedPayload = tryParseDelimited(normalizedSource);
  if (delimitedPayload) {
    return normalizeCurriculum(delimitedPayload);
  }

  if (!openaiApiKey) {
    throw new Error('Configure OPENAI_API_KEY no backend para importar grades nao estruturadas.');
  }

  const aiPayload = await parseWithOpenAI({
    sourceText: normalizedSource,
    fileName,
    openaiApiKey,
    openaiModel,
  });

  return normalizeCurriculum(aiPayload);
}

module.exports = {
  normalizeCurriculum,
  parseCurriculumSource,
};
