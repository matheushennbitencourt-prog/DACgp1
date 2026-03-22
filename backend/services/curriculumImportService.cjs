const crypto = require('crypto');
const mammoth = require('mammoth');
const OpenAI = require('openai');

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'json', 'md']);
const DOCX_EXTENSIONS = new Set(['docx']);
const PDF_EXTENSIONS = new Set(['pdf']);
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const curriculumSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'code', 'trailLabels', 'subjects'],
  properties: {
    id: { type: 'string' },
    code: { type: 'string' },
    baseCode: { type: 'string' },
    name: { type: 'string' },
    catalogName: { type: 'string' },
    catalogKey: { type: 'string' },
    academicYear: { type: 'integer' },
    versionLabel: { type: 'string' },
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

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSubjectId(value, fallback) {
  return String(value || fallback || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeReferenceIds(value) {
  return uniqueList(normalizeList(value).map((item) => normalizeSubjectId(item)).filter(Boolean));
}

function sanitizeSubject(subject, index) {
  return {
    id: normalizeSubjectId(subject.id, `SUBJ${index + 1}`),
    name: String(subject.name || `Disciplina ${index + 1}`).trim(),
    semester: Math.max(1, Number(subject.semester || 1)),
    trail: String(subject.trail || 'Base').trim() || 'Base',
    prerequisites: normalizeReferenceIds(subject.prerequisites),
    corequisites: normalizeReferenceIds(subject.corequisites),
  };
}

function extractAcademicYear(...values) {
  const yearPattern = /\b(19|20)\d{2}\b/g;

  for (const value of values) {
    const matches = String(value || '').match(yearPattern);

    if (matches?.length) {
      return Number(matches[matches.length - 1]);
    }
  }

  return null;
}

function stripAcademicYear(value) {
  return String(value || '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[-_/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferBaseCode(parsedCurriculum, fallbackName) {
  const explicit = String(parsedCurriculum.baseCode || parsedCurriculum.code || '')
    .trim()
    .toUpperCase()
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');

  if (explicit) {
    return explicit.slice(0, 16);
  }

  const initials = stripAcademicYear(fallbackName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (initials || 'CURSO').slice(0, 16);
}

function inferCatalogName(parsedCurriculum) {
  const resolvedName = String(
    parsedCurriculum.catalogName || parsedCurriculum.name || parsedCurriculum.code || 'Grade importada',
  ).trim();

  return stripAcademicYear(resolvedName) || resolvedName;
}

function inferVersionLabel(parsedCurriculum, academicYear) {
  const explicitLabel = String(parsedCurriculum.versionLabel || '').trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  if (academicYear) {
    return String(academicYear);
  }

  return 'Grade padrao';
}

function getFileExtension(fileName = '', mimeType = '') {
  const trimmedName = String(fileName || '').trim().toLowerCase();
  const extensionFromName = trimmedName.includes('.')
    ? trimmedName.split('.').pop()
    : '';

  if (extensionFromName) {
    return extensionFromName;
  }

  if (String(mimeType || '').toLowerCase().includes('pdf')) {
    return 'pdf';
  }

  if (String(mimeType || '').toLowerCase().includes('wordprocessingml.document')) {
    return 'docx';
  }

  return '';
}

function decodeFileData(fileData) {
  const raw = String(fileData || '').trim();

  if (!raw) {
    throw new Error('Envie o arquivo da grade curricular.');
  }

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    throw new Error('O arquivo enviado esta em um formato invalido.');
  }

  if (!ALLOWED_IMPORT_MIME_TYPES.has(dataUrlMatch[1])) {
    throw new Error('Tipo de arquivo nao suportado para importacao de grade.');
  }

  const buffer = Buffer.from(dataUrlMatch[2], 'base64');

  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error('O arquivo da grade excede o limite de 10 MB.');
  }

  return {
    mimeType: dataUrlMatch[1],
    buffer,
    dataUrl: raw,
  };
}

async function extractDocxText(fileData) {
  const { buffer } = decodeFileData(fileData);
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || '').trim();
}

function buildOpenAIClient(openaiApiKey) {
  return new OpenAI({
    apiKey: openaiApiKey,
    maxRetries: 2,
    timeout: 45_000,
  });
}

function buildCurriculumPrompt(fileName) {
  return [
    'Converta a grade curricular enviada para JSON valido.',
    'Extraia o nome do curso sem o ano quando isso estiver claro.',
    'Preencha academicYear e versionLabel quando a grade indicar ano, matriz, PPC ou versao.',
    'Identifique pre-requisitos e correquisitos apenas quando estiverem explicitamente informados.',
    'Use codigos das disciplinas nas listas de prerequisites e corequisites.',
    'Nao invente dependencias ausentes.',
    `Arquivo de origem: ${fileName || 'grade'}.`,
  ].join(' ');
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

async function parseWithOpenAI({
  fileData = '',
  fileName = '',
  openaiApiKey = '',
  openaiClient = null,
  openaiModel = DEFAULT_OPENAI_MODEL,
  sourceText = '',
}) {
  const client = openaiClient || buildOpenAIClient(openaiApiKey);
  const content = [
    {
      type: 'input_text',
      text: buildCurriculumPrompt(fileName),
    },
  ];

  if (sourceText) {
    content.push({
      type: 'input_text',
      text: sourceText,
    });
  }

  if (fileData) {
    content.push({
      type: 'input_file',
      filename: fileName || 'grade.pdf',
      file_data: fileData,
    });
  }

  const payload = await client.responses.create({
    model: openaiModel || DEFAULT_OPENAI_MODEL,
    input: [
      {
        role: 'user',
        content,
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
  });

  const structuredText = extractStructuredText(payload);

  if (!structuredText) {
    throw new Error('A OpenAI API nao retornou uma grade estruturada.');
  }

  return JSON.parse(structuredText);
}

function normalizeCurriculum(parsedCurriculum, { fileName = '', sourceText = '' } = {}) {
  const rawSubjects = Array.isArray(parsedCurriculum.subjects)
    ? parsedCurriculum.subjects.map((subject, index) => sanitizeSubject(subject, index))
    : [];

  if (rawSubjects.length === 0) {
    throw new Error('Nenhuma disciplina valida foi encontrada na grade enviada.');
  }

  const subjectIds = new Set(rawSubjects.map((subject) => subject.id));
  const subjects = rawSubjects.map((subject) => ({
    ...subject,
    prerequisites: uniqueList(subject.prerequisites.filter((item) => subjectIds.has(item) && item !== subject.id)),
    corequisites: uniqueList(subject.corequisites.filter((item) => subjectIds.has(item) && item !== subject.id)),
  }));

  const catalogName = inferCatalogName(parsedCurriculum);
  const academicYear = extractAcademicYear(
    parsedCurriculum.academicYear,
    parsedCurriculum.versionLabel,
    parsedCurriculum.name,
    parsedCurriculum.catalogName,
    fileName,
    sourceText.slice(0, 4000),
  );
  const versionLabel = inferVersionLabel(parsedCurriculum, academicYear);
  const baseCode = inferBaseCode(parsedCurriculum, catalogName);
  const catalogKey = slugify(parsedCurriculum.catalogKey || baseCode || catalogName) || crypto.randomUUID();
  const idSeed = parsedCurriculum.id
    || (academicYear ? `${catalogKey}-${academicYear}` : `${catalogKey}-${versionLabel}`);
  const id = slugify(idSeed) || crypto.randomUUID();
  const uniqueTrails = uniqueList(subjects.map((subject) => subject.trail).filter((trail) => trail !== 'Base'));

  return {
    id,
    code: String(parsedCurriculum.code || baseCode || 'CURSO').trim().toUpperCase().slice(0, 16),
    baseCode,
    name: catalogName,
    catalogName,
    catalogKey,
    academicYear,
    versionLabel,
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
    academicYear: extractAcademicYear(lines[0]),
    trailLabels: uniqueList(rows.map((row) => row.trail).filter((trail) => trail && trail !== 'Base')),
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

async function parseCurriculumSource(
  {
    fileData = '',
    fileName = '',
    mimeType = '',
    openaiApiKey = '',
    openaiModel = DEFAULT_OPENAI_MODEL,
    sourceText = '',
  },
  {
    docxTextExtractor = extractDocxText,
    openaiClient = null,
  } = {},
) {
  const extension = getFileExtension(fileName, mimeType);
  let normalizedSource = String(sourceText || '').trim();

  if (!normalizedSource && DOCX_EXTENSIONS.has(extension)) {
    normalizedSource = await docxTextExtractor(fileData);
  }

  if (!normalizedSource && !fileData) {
    throw new Error('Envie o conteudo ou o arquivo da grade curricular.');
  }

  if (normalizedSource && (!extension || TEXT_EXTENSIONS.has(extension) || DOCX_EXTENSIONS.has(extension))) {
    const jsonPayload = tryParseJson(normalizedSource);
    if (jsonPayload) {
      return normalizeCurriculum(jsonPayload, { fileName, sourceText: normalizedSource });
    }

    const delimitedPayload = tryParseDelimited(normalizedSource);
    if (delimitedPayload) {
      return normalizeCurriculum(delimitedPayload, { fileName, sourceText: normalizedSource });
    }
  }

  if (!openaiApiKey) {
    throw new Error('Configure OPENAI_API_KEY no backend para importar PDF, DOCX ou grades nao estruturadas.');
  }

  if (fileData) {
    const decodedFile = decodeFileData(fileData);

    if (PDF_EXTENSIONS.has(extension) && !decodedFile.mimeType.includes('pdf')) {
      throw new Error('O arquivo enviado nao parece ser um PDF valido.');
    }
  }

  const aiPayload = await parseWithOpenAI({
    fileData: PDF_EXTENSIONS.has(extension) ? String(fileData || '').trim() : '',
    fileName,
    openaiApiKey,
    openaiClient,
    openaiModel,
    sourceText: normalizedSource,
  });

  return normalizeCurriculum(aiPayload, {
    fileName,
    sourceText: normalizedSource,
  });
}

module.exports = {
  normalizeCurriculum,
  parseCurriculumSource,
};
