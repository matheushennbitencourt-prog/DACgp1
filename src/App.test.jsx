import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

const curriculumsResponse = [
  { id: 'cc', code: 'CC', name: 'Ciência da Computação', trailLabels: ['Desenvolvedor', 'Cientista'], totalSubjects: 12 },
  { id: 'si', code: 'SI', name: 'Sistemas de Informação', trailLabels: ['Analista', 'Gestor'], totalSubjects: 12 },
];

const loginUser = {
  id: 'user-1',
  name: 'Lucas Demo',
  username: 'lucas',
  registration: '2026000001',
  email: 'lucas@coursemapper.local',
  courseId: 'cc',
  avatarUrl: '',
  preferences: { theme: 'brand' },
};

const mapResponse = {
  course: {
    id: 'cc',
    code: 'CC',
    name: 'Ciência da Computação',
    trailLabels: ['Desenvolvedor', 'Cientista'],
  },
  stats: {
    totalSubjects: 12,
    completedCount: 3,
    availableCount: 3,
    lockedCount: 6,
    completionRate: 25,
    remainingCriticalSemesters: 3,
  },
  subjects: [
    { id: 'CC101', name: 'Introdução à Computação', semester: 1, trail: 'Base', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'CC102', name: 'Algoritmos I', semester: 1, trail: 'Desenvolvedor', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'CC103', name: 'Matemática Discreta', semester: 1, trail: 'Cientista', prerequisites: [], corequisites: [], status: 'completed', isCritical: false },
    { id: 'CC201', name: 'Algoritmos II', semester: 2, trail: 'Desenvolvedor', prerequisites: ['CC102'], corequisites: [], status: 'available', isCritical: true },
  ],
};

function jsonResponse(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza a tela de login e valida matrícula antes do submit', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/curriculums')) {
        return jsonResponse(curriculumsResponse);
      }

      throw new Error(`Rota inesperada no teste: ${String(url)}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('CourseMapper')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('A matrícula deve ter 10 dígitos.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('faz login e carrega o painel principal', async () => {
    const fetchMock = vi.fn((url, options) => {
      const normalizedUrl = String(url);

      if (normalizedUrl.endsWith('/curriculums')) {
        return jsonResponse(curriculumsResponse);
      }

      if (normalizedUrl.endsWith('/auth/login')) {
        expect(options?.method).toBe('POST');
        return jsonResponse({ token: 'token-demo', user: loginUser });
      }

      if (normalizedUrl.includes('/map?courseId=cc')) {
        return jsonResponse(mapResponse);
      }

      throw new Error(`Rota inesperada no teste: ${normalizedUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.change(await screen.findByLabelText('Matrícula'), { target: { value: '2026000001' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Bom ver você por aqui, Lucas.')).toBeTruthy();
    });

    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('Próximos passos')).toBeTruthy();
  });
});
