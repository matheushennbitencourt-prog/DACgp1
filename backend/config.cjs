const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
  quiet: process.env.NODE_ENV === 'test',
});

module.exports = {
  port: Number(process.env.PORT || 3001),
  storageDriver: process.env.STORAGE_DRIVER || 'file',
  usersFile: path.resolve(
    __dirname,
    '..',
    process.env.USERS_FILE || 'backend/data/users.json',
  ),
  importedCurriculumsFile: path.resolve(
    __dirname,
    '..',
    process.env.IMPORTED_CURRICULUMS_FILE || 'backend/data/imported-curriculums.json',
  ),
  databaseUrl: process.env.DATABASE_URL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};
