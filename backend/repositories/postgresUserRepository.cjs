const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

class PostgresUserRepository {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.pool = null;
  }

  async init() {
    if (!this.databaseUrl) {
      throw new Error('DATABASE_URL nao foi definido para o driver postgres.');
    }

    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.databaseUrl,
        ssl: {
          rejectUnauthorized: false,
        },
      });
    }

    const schemaPath = path.resolve(__dirname, '..', 'sql', 'schema.postgres.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await this.pool.query(schemaSql);
  }

  async query(text, params = []) {
    await this.init();
    return this.pool.query(text, params);
  }

  mapUser(row, progressRows = []) {
    const progress = progressRows.reduce((accumulator, item) => {
      if (!accumulator[item.course_id]) {
        accumulator[item.course_id] = [];
      }

      accumulator[item.course_id].push(item.subject_id);
      return accumulator;
    }, {});

    return {
      id: row.id,
      name: row.name,
      username: row.username || '',
      registration: row.registration,
      email: row.email,
      courseId: row.course_id,
      avatarUrl: row.avatar_url || '',
      passwordHash: row.password_hash,
      sessionToken: row.session_token || '',
      preferences: {
        theme: row.preferences_theme || 'brand',
      },
      progress,
    };
  }

  async getProgressRows(userId, client = this.pool) {
    const result = await client.query(
      `select course_id, subject_id
       from user_progress
       where user_id = $1
       order by course_id, subject_id`,
      [userId],
    );

    return result.rows;
  }

  async findByField(field, value) {
    const allowedFields = new Set(['id', 'registration', 'email', 'session_token']);

    if (!allowedFields.has(field)) {
      throw new Error(`Campo de busca nao suportado: ${field}`);
    }

    const result = await this.query(
      `select id, name, username, registration, email, course_id, avatar_url, password_hash, session_token, preferences_theme
       from users
       where ${field} = $1
       limit 1`,
      [value],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const progressRows = await this.getProgressRows(row.id);
    return this.mapUser(row, progressRows);
  }

  async findByToken(token) {
    return this.findByField('session_token', token);
  }

  async findByRegistration(registration) {
    return this.findByField('registration', registration);
  }

  async findByEmail(email) {
    return this.findByField('email', email);
  }

  async create(user) {
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      await client.query(
        `insert into users (
          id, name, username, registration, email, course_id, avatar_url,
          password_hash, session_token, preferences_theme
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          user.id,
          user.name,
          user.username || '',
          user.registration,
          user.email,
          user.courseId,
          user.avatarUrl || '',
          user.passwordHash,
          user.sessionToken || '',
          user.preferences?.theme || 'brand',
        ],
      );

      const progressEntries = Object.entries(user.progress || {});

      for (const [courseId, subjectIds] of progressEntries) {
        for (const subjectId of subjectIds) {
          await client.query(
            `insert into user_progress (user_id, course_id, subject_id)
             values ($1, $2, $3)`,
            [user.id, courseId, subjectId],
          );
        }
      }

      await client.query('commit');
      return user;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateById(id, updater) {
    const existingUser = await this.findByField('id', id);

    if (!existingUser) {
      return null;
    }

    const nextUser = typeof updater === 'function'
      ? updater(existingUser)
      : { ...existingUser, ...updater };
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      await client.query(
        `update users
         set name = $2,
             username = $3,
             registration = $4,
             email = $5,
             course_id = $6,
             avatar_url = $7,
             password_hash = $8,
             session_token = $9,
             preferences_theme = $10,
             updated_at = now()
         where id = $1`,
        [
          id,
          nextUser.name,
          nextUser.username || '',
          nextUser.registration,
          nextUser.email,
          nextUser.courseId,
          nextUser.avatarUrl || '',
          nextUser.passwordHash,
          nextUser.sessionToken || '',
          nextUser.preferences?.theme || 'brand',
        ],
      );

      await client.query('delete from user_progress where user_id = $1', [id]);

      for (const [courseId, subjectIds] of Object.entries(nextUser.progress || {})) {
        for (const subjectId of subjectIds) {
          await client.query(
            `insert into user_progress (user_id, course_id, subject_id)
             values ($1, $2, $3)`,
            [id, courseId, subjectId],
          );
        }
      }

      await client.query('commit');
      return nextUser;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateByToken(token, updater) {
    const existingUser = await this.findByToken(token);

    if (!existingUser) {
      return null;
    }

    return this.updateById(existingUser.id, updater);
  }
}

module.exports = PostgresUserRepository;
