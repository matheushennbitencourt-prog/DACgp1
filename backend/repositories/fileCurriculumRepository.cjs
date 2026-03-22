const fs = require('fs/promises');
const path = require('path');

class FileCurriculumRepository {
  constructor(curriculumsFile) {
    this.curriculumsFile = curriculumsFile;
    this.curriculumsCache = null;
    this.initPromise = null;
    this.writePromise = Promise.resolve();
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await fs.mkdir(path.dirname(this.curriculumsFile), { recursive: true });

        try {
          await fs.access(this.curriculumsFile);
        } catch {
          await fs.writeFile(this.curriculumsFile, '[]', 'utf8');
        }
      })();
    }

    await this.initPromise;
  }

  async readCurriculums() {
    if (this.curriculumsCache) {
      return this.curriculumsCache;
    }

    await this.init();
    const raw = await fs.readFile(this.curriculumsFile, 'utf8');
    this.curriculumsCache = JSON.parse(raw);
    return this.curriculumsCache;
  }

  async writeCurriculums(curriculums) {
    await this.init();
    this.curriculumsCache = curriculums;
    this.writePromise = this.writePromise.then(() => (
      fs.writeFile(this.curriculumsFile, JSON.stringify(curriculums, null, 2), 'utf8')
    ));
    await this.writePromise;
  }

  async list() {
    const curriculums = await this.readCurriculums();
    return [...curriculums];
  }

  async findById(id) {
    const curriculums = await this.readCurriculums();
    return curriculums.find((curriculum) => curriculum.id === id) || null;
  }

  async upsert(curriculum) {
    const curriculums = await this.readCurriculums();
    const index = curriculums.findIndex((item) => item.id === curriculum.id);

    if (index === -1) {
      curriculums.push(curriculum);
    } else {
      curriculums[index] = curriculum;
    }

    await this.writeCurriculums(curriculums);
    return curriculum;
  }
}

module.exports = FileCurriculumRepository;
