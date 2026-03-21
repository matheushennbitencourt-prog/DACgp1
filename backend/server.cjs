const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const config = require('./config.cjs');
const curriculums = require('./data/curriculums.cjs');
const { createUserRepository } = require('./repositories/index.cjs');

const app = express();
const userRepository = createUserRepository();

app.use(cors());
app.use(express.json({ limit: '8mb' }));

const statusOrder = {
  completed: 0,
  available: 1,
  locked: 2,
};

function sanitizeUser(user) {
  const fallbackUsername = String(user.name || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase() || 'usuario';

  return {
    id: user.id,
    name: user.name,
    username: user.username || fallbackUsername,
    registration: user.registration,
    email: user.email,
    courseId: user.courseId,
    avatarUrl: user.avatarUrl || '',
    preferences: {
      theme: user.preferences?.theme || 'brand',
    },
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    Buffer.from(derivedKey, 'hex'),
  );
}

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || '';

  if (!authorization.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice(7);
}

async function getAuthenticatedUser(req) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return null;
  }

  return userRepository.findByToken(token);
}

function buildCurriculumSummary() {
  return Object.values(curriculums).map((curriculum) => ({
    id: curriculum.id,
    code: curriculum.code,
    name: curriculum.name,
    trailLabels: curriculum.trailLabels,
    totalSubjects: curriculum.subjects.length,
  }));
}

function buildChildrenMap(subjects) {
  const childrenMap = new Map();

  subjects.forEach((subject) => {
    childrenMap.set(subject.id, []);
  });

  subjects.forEach((subject) => {
    subject.prerequisites.forEach((prerequisiteId) => {
      if (childrenMap.has(prerequisiteId)) {
        childrenMap.get(prerequisiteId).push(subject.id);
      }
    });
  });

  return childrenMap;
}

function collectDependentSubjects(subjectId, childrenMap, visited = new Set()) {
  const directChildren = childrenMap.get(subjectId) || [];

  directChildren.forEach((childId) => {
    if (!visited.has(childId)) {
      visited.add(childId);
      collectDependentSubjects(childId, childrenMap, visited);
    }
  });

  return visited;
}

function createDepthCalculator(subjectMap, childrenMap) {
  const memo = new Map();

  function getDepth(subjectId) {
    if (memo.has(subjectId)) {
      return memo.get(subjectId);
    }

    const children = childrenMap.get(subjectId) || [];

    if (children.length === 0) {
      memo.set(subjectId, 1);
      return 1;
    }

    const depth = 1 + Math.max(...children.map((childId) => getDepth(childId)));
    memo.set(subjectId, depth);
    return depth;
  }

  subjectMap.forEach((_, subjectId) => {
    getDepth(subjectId);
  });

  return memo;
}

function getCriticalPath(subjects) {
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const childrenMap = buildChildrenMap(subjects);
  const depthMap = createDepthCalculator(subjectMap, childrenMap);
  const roots = subjects.filter((subject) => subject.prerequisites.length === 0);

  if (roots.length === 0) {
    return new Set();
  }

  let current = roots.reduce((best, subject) => (
    depthMap.get(subject.id) > depthMap.get(best.id) ? subject : best
  ), roots[0]);

  const criticalIds = new Set();

  while (current) {
    criticalIds.add(current.id);
    const nextOptions = (childrenMap.get(current.id) || []).map((childId) => subjectMap.get(childId));

    if (nextOptions.length === 0) {
      break;
    }

    current = nextOptions.reduce((best, subject) => (
      depthMap.get(subject.id) > depthMap.get(best.id) ? subject : best
    ), nextOptions[0]);
  }

  return criticalIds;
}

function countRemainingChain(subjectId, pendingIds, subjectMap, memo = new Map()) {
  if (memo.has(subjectId)) {
    return memo.get(subjectId);
  }

  const subject = subjectMap.get(subjectId);
  const pendingPrerequisites = subject.prerequisites.filter((prerequisiteId) => pendingIds.has(prerequisiteId));

  if (pendingPrerequisites.length === 0) {
    memo.set(subjectId, 1);
    return 1;
  }

  const depth = 1 + Math.max(...pendingPrerequisites.map((prerequisiteId) => (
    countRemainingChain(prerequisiteId, pendingIds, subjectMap, memo)
  )));

  memo.set(subjectId, depth);
  return depth;
}

function buildMapPayload(user, selectedCourseId) {
  const courseId = selectedCourseId && curriculums[selectedCourseId]
    ? selectedCourseId
    : user.courseId;
  const curriculum = curriculums[courseId];
  const completedIds = new Set(user.progress?.[courseId] || []);
  const subjectMap = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const criticalPath = getCriticalPath(curriculum.subjects);

  const subjects = curriculum.subjects
    .map((subject) => {
      const allPrerequisitesDone = subject.prerequisites.every((prerequisiteId) => completedIds.has(prerequisiteId));
      const status = completedIds.has(subject.id)
        ? 'completed'
        : allPrerequisitesDone
          ? 'available'
          : 'locked';

      return {
        ...subject,
        status,
        isCritical: criticalPath.has(subject.id),
      };
    })
    .sort((first, second) => {
      if (first.semester !== second.semester) {
        return first.semester - second.semester;
      }

      if (statusOrder[first.status] !== statusOrder[second.status]) {
        return statusOrder[first.status] - statusOrder[second.status];
      }

      return first.id.localeCompare(second.id);
    });

  const totalSubjects = subjects.length;
  const completedCount = subjects.filter((subject) => subject.status === 'completed').length;
  const availableCount = subjects.filter((subject) => subject.status === 'available').length;
  const completionRate = totalSubjects === 0 ? 0 : Math.round((completedCount / totalSubjects) * 100);
  const pendingIds = new Set(subjects.filter((subject) => subject.status !== 'completed').map((subject) => subject.id));
  const remainingCriticalSemesters = pendingIds.size === 0
    ? 0
    : Math.max(...Array.from(pendingIds).map((subjectId) => (
      countRemainingChain(subjectId, pendingIds, subjectMap)
    )));

  return {
    course: {
      id: curriculum.id,
      code: curriculum.code,
      name: curriculum.name,
      trailLabels: curriculum.trailLabels,
    },
    stats: {
      totalSubjects,
      completedCount,
      availableCount,
      lockedCount: totalSubjects - completedCount - availableCount,
      completionRate,
      remainingCriticalSemesters,
    },
    subjects,
  };
}

function validateRegistrationInput(body) {
  const { name, registration, email, password, courseId } = body;

  if (!name || !registration || !email || !password || !courseId) {
    return 'Preencha todos os campos.';
  }

  if (!curriculums[courseId]) {
    return 'Curso invalido.';
  }

  if (String(password).length < 4) {
    return 'A senha deve ter pelo menos 4 caracteres.';
  }

  return '';
}

async function validateProfileUpdate(user, body) {
  const nextName = String(body.name || '').trim();
  const nextUsername = String(body.username || '').trim();
  const nextEmail = String(body.email || '').trim().toLowerCase();
  const nextAvatarUrl = String(body.avatarUrl || '').trim();
  const nextTheme = String(body.theme || '').trim() || 'brand';

  if (nextName.length < 3) {
    return 'Informe um nome valido.';
  }

  if (nextUsername.length < 3) {
    return 'O nome de usuario deve ter pelo menos 3 caracteres.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return 'Informe um e-mail valido.';
  }

  if (!['brand', 'dark', 'white'].includes(nextTheme)) {
    return 'Tema invalido.';
  }

  if (nextAvatarUrl && !nextAvatarUrl.startsWith('data:image/')) {
    return 'Use o upload de imagem para definir a foto de perfil.';
  }

  const existingEmail = await userRepository.findByEmail(nextEmail);
  if (existingEmail && existingEmail.id !== user.id) {
    return 'E-mail ja cadastrado.';
  }

  return '';
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    storageDriver: config.storageDriver,
  });
});

app.get('/api/curriculums', (req, res) => {
  res.json(buildCurriculumSummary());
});

app.post('/api/auth/register', async (req, res) => {
  const validationError = validateRegistrationInput(req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { name, registration, email, password, courseId } = req.body;
  const normalizedRegistration = String(registration).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  const existingRegistration = await userRepository.findByRegistration(normalizedRegistration);
  if (existingRegistration) {
    return res.status(409).json({ error: 'Matricula ja cadastrada.' });
  }

  const existingEmail = await userRepository.findByEmail(normalizedEmail);
  if (existingEmail) {
    return res.status(409).json({ error: 'E-mail ja cadastrado.' });
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    username: String(name).trim().split(/\s+/)[0].toLowerCase(),
    registration: normalizedRegistration,
    email: normalizedEmail,
    courseId,
    avatarUrl: '',
    passwordHash: hashPassword(String(password)),
    sessionToken: crypto.randomUUID(),
    preferences: {
      theme: 'brand',
    },
    progress: {
      [courseId]: [],
    },
  };

  await userRepository.create(user);

  return res.status(201).json({
    token: user.sessionToken,
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { registration, password } = req.body;

  if (!registration || !password) {
    return res.status(400).json({ error: 'Informe matricula e senha.' });
  }

  const normalizedRegistration = String(registration).trim();
  const user = await userRepository.findByRegistration(normalizedRegistration);

  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'Credenciais invalidas.' });
  }

  const sessionToken = crypto.randomUUID();
  const updatedUser = await userRepository.updateById(user.id, {
    ...user,
    sessionToken,
  });

  return res.json({
    token: updatedUser.sessionToken,
    user: sanitizeUser(updatedUser),
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(204).send();
  }

  await userRepository.updateByToken(token, (user) => ({
    ...user,
    sessionToken: '',
  }));

  return res.status(204).send();
});

app.get('/api/auth/me', async (req, res) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Sessao invalida.' });
  }

  return res.json({ user: sanitizeUser(user) });
});

app.patch('/api/profile', async (req, res) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Sessao invalida.' });
  }

  const validationError = await validateProfileUpdate(user, req.body);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const updatedUser = await userRepository.updateById(user.id, {
    ...user,
    name: String(req.body.name).trim(),
    username: String(req.body.username).trim(),
    email: String(req.body.email).trim().toLowerCase(),
    courseId: user.courseId,
    avatarUrl: String(req.body.avatarUrl || '').trim(),
    preferences: {
      ...user.preferences,
      theme: String(req.body.theme || 'brand').trim(),
    },
  });

  return res.json({ user: sanitizeUser(updatedUser) });
});

app.get('/api/map', async (req, res) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Sessao invalida.' });
  }

  return res.json(buildMapPayload(user, req.query.courseId));
});

app.post('/api/progress/toggle', async (req, res) => {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Sessao invalida.' });
  }

  const { courseId, subjectId, completed } = req.body;
  const selectedCourseId = courseId && curriculums[courseId] ? courseId : user.courseId;
  const curriculum = curriculums[selectedCourseId];
  const targetSubject = curriculum.subjects.find((subject) => subject.id === subjectId);

  if (!targetSubject) {
    return res.status(404).json({ error: 'Disciplina nao encontrada.' });
  }

  const currentProgress = new Set(user.progress?.[selectedCourseId] || []);
  const childrenMap = buildChildrenMap(curriculum.subjects);

  if (completed) {
    const prerequisitesReady = targetSubject.prerequisites.every((prerequisiteId) => currentProgress.has(prerequisiteId));

    if (!prerequisitesReady) {
      return res.status(400).json({ error: 'Pre-requisitos ainda nao concluidos.' });
    }

    currentProgress.add(subjectId);
  } else {
    const dependentCompleted = Array.from(
      collectDependentSubjects(subjectId, childrenMap),
    ).filter((dependentId) => currentProgress.has(dependentId));

    if (dependentCompleted.length > 0) {
      return res.status(400).json({
        error: `Nao e possivel desfazer esta disciplina enquanto ${dependentCompleted.join(', ')} estiver concluida.`,
      });
    }

    currentProgress.delete(subjectId);
  }

  const updatedUser = await userRepository.updateById(user.id, {
    ...user,
    progress: {
      ...user.progress,
      [selectedCourseId]: Array.from(currentProgress),
    },
  });

  return res.json(buildMapPayload(updatedUser, selectedCourseId));
});

app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'Rota da API nao encontrada.' });
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'A imagem enviada e grande demais. Use uma foto menor.' });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Requisicao invalida.' });
  }

  return next(error);
});

userRepository.init()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`CourseMapper backend ativo em http://localhost:${config.port}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar o backend:', error);
    process.exit(1);
  });
