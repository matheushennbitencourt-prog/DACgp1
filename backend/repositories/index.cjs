const config = require('../config.cjs');
const FileUserRepository = require('./fileUserRepository.cjs');

function createUserRepository() {
  if (config.storageDriver === 'file') {
    return new FileUserRepository(config.usersFile);
  }

  throw new Error(
    `STORAGE_DRIVER="${config.storageDriver}" ainda nao foi implementado. Use "file" ou conecte um repositorio SQL.`,
  );
}

module.exports = {
  createUserRepository,
};
