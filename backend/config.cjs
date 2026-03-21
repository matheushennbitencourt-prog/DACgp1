const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  port: Number(process.env.PORT || 3001),
  storageDriver: process.env.STORAGE_DRIVER || 'file',
  usersFile: path.resolve(
    __dirname,
    '..',
    process.env.USERS_FILE || 'backend/data/users.json',
  ),
  databaseUrl: process.env.DATABASE_URL || '',
};
