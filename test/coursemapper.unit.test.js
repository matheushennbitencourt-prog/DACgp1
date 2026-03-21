import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  buildBoardLayout,
  formatRegistration,
  getSettingsForm,
  getTrailOrder,
  groupBySemester,
  normalizeRegistration,
  validateAuthForm,
  validateSettingsForm,
} from '../src/app-utils.js';

process.env.STORAGE_DRIVER = 'file';
process.env.USERS_FILE = path.join(tmpdir(), `coursemapper-test-users-${Date.now()}.json`);

const require = createRequire(import.meta.url);
const curriculums = require('../backend/data/curriculums.cjs');
const backendModule = require('../backend/server.cjs');

const {
  buildCurriculumSummary,
  buildMapPayload,
  getCriticalPath,
  hashPassword,
  sanitizeUser,
  startServer,
  validateRegistrationInput,
  verifyPassword,
} = backendModule;

const demoUser = {
  id: 'user-1',
  name: 'Lucas Demo',
  username: 'lucas',
  registration: '2026000001',
  email: 'lucas@coursemapper.local',
  courseId: 'cc',
  avatarUrl: '',
  preferences: { theme: 'brand' },
  progress: {
    cc: ['CC101', 'CC102', 'CC103'],
  },
};

test('frontend utils normalize and validate auth/settings data', () => {
  assert.equal(normalizeRegistration('2026 000001abc'), '2026000001');
  assert.equal(formatRegistration('2026000001'), '2026 000001');
  assert.equal(validateAuthForm('register', {
    name: 'Lucas Demo',
    registration: '2026 000001',
    email: 'lucas@coursemapper.local',
    password: '1234',
  }), '');
  assert.match(validateSettingsForm({
    name: 'Lu',
    username: 'lucas',
    email: 'lucas@coursemapper.local',
    theme: 'brand',
  }), /nome/i);
});

test('backend helpers sanitize, hash and validate registration input', () => {
  const passwordHash = hashPassword('1234');
  const sanitized = sanitizeUser(demoUser);

  assert.equal(verifyPassword('1234', passwordHash), true);
  assert.equal(verifyPassword('4321', passwordHash), false);
  assert.equal(sanitized.preferences.theme, 'brand');
  assert.equal(validateRegistrationInput({
    name: 'Lucas Demo',
    registration: '2026000001',
    email: 'lucas@coursemapper.local',
    password: '1234',
    courseId: 'cc',
  }), '');
  assert.match(validateRegistrationInput({
    name: 'Lucas Demo',
    registration: '2026000001',
    email: 'lucas@coursemapper.local',
    password: '1234',
    courseId: 'curso-invalido',
  }), /curso/i);
});

test('map payload and derived summaries keep the academic flow consistent', () => {
  const mapData = buildMapPayload(demoUser, 'cc');
  const grouped = groupBySemester(mapData.subjects);
  const trailOrder = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const criticalPath = getCriticalPath(curriculums.cc.subjects);
  const settingsForm = getSettingsForm(demoUser);
  const curriculumSummary = buildCurriculumSummary();

  assert.equal(mapData.stats.completedCount, 3);
  assert.equal(mapData.stats.availableCount, 3);
  assert.equal(mapData.stats.completionRate, 25);
  assert.equal(grouped['1'].length, 3);
  assert.ok(criticalPath.size > 0);
  assert.deepEqual(trailOrder, ['Base', 'Desenvolvedor', 'Cientista']);
  assert.equal(settingsForm.username, 'lucas');
  assert.equal(curriculumSummary.length, 2);
  assert.ok(mapData.subjects.some((subject) => subject.id === 'CC201' && subject.status === 'available'));
});

test('board layout places all subjects inside the expected grid', () => {
  const mapData = buildMapPayload(demoUser, 'cc');
  const trailOrder = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const semesters = [...new Set(mapData.subjects.map((subject) => subject.semester))].sort((a, b) => a - b);
  const layout = buildBoardLayout(mapData.subjects, trailOrder, semesters);

  assert.equal(layout.placements.size, mapData.subjects.length);
  assert.ok(layout.width > 0);
  assert.ok(layout.height > 0);
  assert.ok(layout.placements.get('CC101').x < layout.placements.get('CC202').x);
});

test('core calculations stay under the 200 ms target', () => {
  const firstStart = performance.now();
  buildMapPayload(demoUser, 'cc');
  const mapDuration = performance.now() - firstStart;

  const mapData = buildMapPayload(demoUser, 'cc');
  const trailOrder = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const semesters = [...new Set(mapData.subjects.map((subject) => subject.semester))].sort((a, b) => a - b);

  const secondStart = performance.now();
  buildBoardLayout(mapData.subjects, trailOrder, semesters);
  const layoutDuration = performance.now() - secondStart;

  assert.ok(mapDuration < 200, `buildMapPayload excedeu 200 ms: ${mapDuration.toFixed(2)} ms`);
  assert.ok(layoutDuration < 200, `buildBoardLayout excedeu 200 ms: ${layoutDuration.toFixed(2)} ms`);
});

test('health endpoint responds under 200 ms in local file mode', async (t) => {
  const server = await startServer(0);
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(process.env.USERS_FILE, { force: true });
  });

  const { port } = server.address();
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const duration = performance.now() - start;
  const body = await response.json();

  assert.equal(response.ok, true);
  assert.equal(body.ok, true);
  assert.equal(body.storageDriver, 'file');
  assert.ok(duration < 200, `GET /api/health excedeu 200 ms: ${duration.toFixed(2)} ms`);
});

test('backend routes register, login and return map payload correctly', async (t) => {
  const server = await startServer(0);
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(process.env.USERS_FILE, { force: true });
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const registerResponse = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Maria Teste',
      registration: '2026999999',
      email: 'maria@coursemapper.local',
      password: '1234',
      courseId: 'cc',
    }),
  });
  const registerBody = await registerResponse.json();

  assert.equal(registerResponse.status, 201);
  assert.ok(registerBody.token);
  assert.equal(registerBody.user.name, 'Maria Teste');

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registration: '2026999999',
      password: '1234',
    }),
  });
  const loginBody = await loginResponse.json();

  assert.equal(loginResponse.status, 200);
  assert.ok(loginBody.token);

  const mapResponse = await fetch(`${baseUrl}/map?courseId=cc`, {
    headers: {
      Authorization: `Bearer ${loginBody.token}`,
    },
  });
  const mapBody = await mapResponse.json();

  assert.equal(mapResponse.status, 200);
  assert.equal(mapBody.course.id, 'cc');
  assert.equal(mapBody.stats.completedCount, 0);
  assert.ok(Array.isArray(mapBody.subjects));
});
