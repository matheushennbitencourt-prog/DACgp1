const config = require('../config.cjs');
const FileUserRepository = require('./fileUserRepository.cjs');
const FileCurriculumRepository = require('./fileCurriculumRepository.cjs');
const PostgresCurriculumRepository = require('./postgresCurriculumRepository.cjs');
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

function createCurriculumRepository() {
  if (config.storageDriver === 'file') {
    return new FileCurriculumRepository(config.importedCurriculumsFile);
  }

  if (config.storageDriver === 'postgres') {
    return new PostgresCurriculumRepository(config.databaseUrl);
  }

  throw new Error(
    `STORAGE_DRIVER="${config.storageDriver}" ainda nao foi implementado. Use "file" ou "postgres".`,
  );
}

module.exports = {
  createCurriculumRepository,
  createUserRepository,
};
