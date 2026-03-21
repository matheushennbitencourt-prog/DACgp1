const crypto = require('crypto');

const curriculums = require('./data/curriculums.cjs');
const { createUserRepository } = require('./repositories/index.cjs');

const userRepository = createUserRepository();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

async function run() {
  await userRepository.init();

  const registration = '2026000001';
  const email = 'lucas@coursemapp.local';
  const existingUser = await userRepository.findByRegistration(registration);

  if (existingUser) {
    console.log('Usuario demo ja existe.');
    return;
  }

  await userRepository.create({
    id: crypto.randomUUID(),
    name: 'Lucas Demo',
    username: 'lucasdemo',
    registration,
    email,
    courseId: 'cc',
    avatarUrl: '',
    passwordHash: hashPassword('1234'),
    sessionToken: '',
    preferences: {
      theme: 'brand',
    },
    progress: {
      cc: ['CC101', 'CC102', 'CC103'],
      si: [],
    },
  });

  console.log('Usuario demo criado com sucesso.');
  console.log('Matricula: 2026000001');
  console.log('Senha: 1234');
  console.log(`Cursos disponiveis: ${Object.keys(curriculums).join(', ')}`);
}

run().catch((error) => {
  console.error('Falha ao criar usuario demo:', error);
  process.exit(1);
});
