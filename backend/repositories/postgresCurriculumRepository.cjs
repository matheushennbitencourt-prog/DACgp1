const fs = require('fs/promises');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

class PostgresCurriculumRepository {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.sql = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    if (!this.databaseUrl) {
      throw new Error('DATABASE_URL nao foi definido para o driver postgres.');
    }

    this.sql = neon(this.databaseUrl);
    const schemaPath = path.resolve(__dirname, '..', 'sql', 'schema.postgres.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    const statements = schemaSql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await this.sql.query(statement);
    }

    this.initialized = true;
  }

  async query(text, params = [], options = {}) {
    await this.init();
    return this.sql.query(text, params, options);
  }

  mapCurriculum(row) {
    return {
      id: row.id,
      code: row.code,
      baseCode: row.base_code,
      name: row.name,
      catalogName: row.catalog_name,
      catalogKey: row.catalog_key,
      academicYear: row.academic_year,
      versionLabel: row.version_label,
      trailLabels: Array.isArray(row.trail_labels) ? row.trail_labels : JSON.parse(row.trail_labels || '[]'),
      subjects: Array.isArray(row.subjects) ? row.subjects : JSON.parse(row.subjects || '[]'),
    };
  }

  async list() {
    const rows = await this.query(
      `select id, code, base_code, name, catalog_name, catalog_key, academic_year, version_label, trail_labels, subjects
       from imported_curriculums
       order by catalog_name asc, academic_year desc nulls last, id asc`,
    );

    return rows.map((row) => this.mapCurriculum(row));
  }

  async findById(id) {
    const rows = await this.query(
      `select id, code, base_code, name, catalog_name, catalog_key, academic_year, version_label, trail_labels, subjects
       from imported_curriculums
       where id = $1
       limit 1`,
      [id],
    );

    return rows.length === 0 ? null : this.mapCurriculum(rows[0]);
  }

  async upsert(curriculum) {
    await this.init();
    await this.query(
      `insert into imported_curriculums (
         id, code, base_code, name, catalog_name, catalog_key, academic_year, version_label, trail_labels, subjects, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
       on conflict (id) do update
       set code = excluded.code,
           base_code = excluded.base_code,
           name = excluded.name,
           catalog_name = excluded.catalog_name,
           catalog_key = excluded.catalog_key,
           academic_year = excluded.academic_year,
           version_label = excluded.version_label,
           trail_labels = excluded.trail_labels,
           subjects = excluded.subjects,
           updated_at = now()`,
      [
        curriculum.id,
        curriculum.code,
        curriculum.baseCode || curriculum.code,
        curriculum.name,
        curriculum.catalogName || curriculum.name,
        curriculum.catalogKey || curriculum.id,
        curriculum.academicYear,
        curriculum.versionLabel || '',
        JSON.stringify(curriculum.trailLabels || []),
        JSON.stringify(curriculum.subjects || []),
      ],
    );

    return curriculum;
  }
}

module.exports = PostgresCurriculumRepository;
