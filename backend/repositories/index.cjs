const config = require('../config.cjs');
const FileUserRepository = require('./fileUserRepository.cjs');
const PostgresUserRepository = require('./postgresUserRepository.cjs');

function createUserRepository() {
  if (config.storageDriver === 'file') {
    return new FileUserRepository(config.usersFile);
  }

  if (config.storageDriver === 'postgres') {
    return new PostgresUserRepository(config.databaseUrl);
  }

  throw new Error(
    `STORAGE_DRIVER="${config.storageDriver}" ainda nao foi implementado. Use "file" ou "postgres".`,
  );
}

module.exports = {
  createUserRepository,
};
