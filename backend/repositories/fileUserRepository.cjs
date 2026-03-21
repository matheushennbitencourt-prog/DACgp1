const fs = require('fs/promises');
const path = require('path');

class FileUserRepository {
  constructor(usersFile) {
    this.usersFile = usersFile;
  }

  async init() {
    await fs.mkdir(path.dirname(this.usersFile), { recursive: true });

    try {
      await fs.access(this.usersFile);
    } catch {
      await fs.writeFile(this.usersFile, '[]', 'utf8');
    }
  }

  async readUsers() {
    await this.init();
    const raw = await fs.readFile(this.usersFile, 'utf8');
    return JSON.parse(raw);
  }

  async writeUsers(users) {
    await this.init();
    await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2), 'utf8');
  }

  async findByToken(token) {
    const users = await this.readUsers();
    return users.find((user) => user.sessionToken === token) || null;
  }

  async findByRegistration(registration) {
    const users = await this.readUsers();
    return users.find((user) => user.registration === registration) || null;
  }

  async findByEmail(email) {
    const users = await this.readUsers();
    return users.find((user) => user.email === email) || null;
  }

  async create(user) {
    const users = await this.readUsers();
    users.push(user);
    await this.writeUsers(users);
    return user;
  }

  async updateById(id, updater) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.id === id);

    if (index === -1) {
      return null;
    }

    const nextUser = typeof updater === 'function'
      ? updater(users[index])
      : { ...users[index], ...updater };

    users[index] = nextUser;
    await this.writeUsers(users);
    return nextUser;
  }

  async updateByToken(token, updater) {
    const existingUser = await this.findByToken(token);

    if (!existingUser) {
      return null;
    }

    return this.updateById(existingUser.id, updater);
  }
}

module.exports = FileUserRepository;
