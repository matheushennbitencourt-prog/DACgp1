// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';

import App from './App.jsx';

const curriculumsResponse = [
  {
    id: 'cc',
    code: 'CC',
    baseCode: 'CC',
    name: 'Ciencia da Computacao',
    catalogName: 'Ciencia da Computacao',
    catalogKey: 'cc',
    versionLabel: 'Grade padrao',
    trailLabels: ['Desenvolvedor', 'Cientista'],
    totalSubjects: 12,
  },
  {
    id: 'si',
    code: 'SI',
    baseCode: 'SI',
    name: 'Sistemas de Informacao',
    catalogName: 'Sistemas de Informacao',
    catalogKey: 'si',
    versionLabel: 'Grade padrao',
    trailLabels: ['Analista', 'Gestor'],
    totalSubjects: 12,
  },
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
    catalogKey: 'cc',
    name: 'Ciencia da Computacao',
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
    { id: 'CC101', name: 'Introducao a Computacao', semester: 1, trail: 'Base', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'CC102', name: 'Algoritmos I', semester: 1, trail: 'Desenvolvedor', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'CC103', name: 'Matematica Discreta', semester: 1, trail: 'Cientista', prerequisites: [], corequisites: [], status: 'completed', isCritical: false },
    { id: 'CC201', name: 'Algoritmos II', semester: 2, trail: 'Desenvolvedor', prerequisites: ['CC102'], corequisites: [], status: 'available', isCritical: true },
  ],
};

const siMapResponse = {
  course: {
    id: 'si',
    code: 'SI',
    catalogKey: 'si',
    name: 'Sistemas de Informacao',
    trailLabels: ['Analista', 'Gestor'],
  },
  stats: {
    totalSubjects: 12,
    completedCount: 2,
    availableCount: 2,
    lockedCount: 8,
    completionRate: 17,
    remainingCriticalSemesters: 3,
  },
  subjects: [
    { id: 'SI101', name: 'Fundamentos de Sistemas de Informacao', semester: 1, trail: 'Analista', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'SI103', name: 'Gestao e Organizacoes', semester: 1, trail: 'Gestor', prerequisites: [], corequisites: [], status: 'completed', isCritical: true },
    { id: 'SI201', name: 'Analise de Requisitos', semester: 2, trail: 'Analista', prerequisites: ['SI101'], corequisites: [], status: 'available', isCritical: true },
    { id: 'SI203', name: 'Processos Empresariais', semester: 2, trail: 'Gestor', prerequisites: ['SI103'], corequisites: [], status: 'available', isCritical: false },
  ],
};

function jsonResponse(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderApp() {
  return render(
    <HashRouter>
      <App />
    </HashRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = '#/';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza a tela de login e valida matricula antes do submit', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/curriculums')) {
        return jsonResponse(curriculumsResponse);
      }

      throw new Error(`Rota inesperada no teste: ${String(url)}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    expect(await screen.findByText('CourseMapper')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/matr[ií]cula deve ter 10 d[ií]gitos/i)).toBeTruthy();
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

    renderApp();

    fireEvent.change(await screen.findByLabelText(/matr[ií]cula/i), { target: { value: '2026000001' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText(/Bom ver voc[eê] por aqui, Lucas\./i)).toBeTruthy();
    });

    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText(/Pr[oó]ximos passos/i)).toBeTruthy();
  });

  it('permite salvar apenas a troca de tema nas configuracoes', async () => {
    const profilePayloads = [];
    window.localStorage.setItem('coursemapper_token', 'token-demo');

    const fetchMock = vi.fn((url, options = {}) => {
      const normalizedUrl = String(url);

      if (normalizedUrl.endsWith('/curriculums')) {
        return jsonResponse(curriculumsResponse);
      }

      if (normalizedUrl.endsWith('/auth/me')) {
        return jsonResponse({ user: loginUser });
      }

      if (normalizedUrl.includes('/map?courseId=cc')) {
        return jsonResponse(mapResponse);
      }

      if (normalizedUrl.endsWith('/profile')) {
        profilePayloads.push(JSON.parse(options.body));
        return jsonResponse({
          user: {
            ...loginUser,
            preferences: { theme: 'dark' },
          },
        });
      }

      throw new Error(`Rota inesperada no teste: ${normalizedUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/Bom ver voc[eê] por aqui, Lucas\./i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Configura[cç][oõ]es$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar configura/i }));

    await waitFor(() => {
      expect(profilePayloads).toEqual([
        {
          name: 'Lucas Demo',
          username: 'lucas',
          email: 'lucas@coursemapper.local',
          avatarUrl: '',
          theme: 'dark',
        },
      ]);
    });

    expect(await screen.findByText(/salvas com sucesso/i)).toBeTruthy();
  });

  it('troca o curso na sidebar e recarrega o mapa correto', async () => {
    window.localStorage.setItem('coursemapper_token', 'token-demo');

    const fetchMock = vi.fn((url) => {
      const normalizedUrl = String(url);

      if (normalizedUrl.endsWith('/curriculums')) {
        return jsonResponse(curriculumsResponse);
      }

      if (normalizedUrl.endsWith('/auth/me')) {
        return jsonResponse({ user: loginUser });
      }

      if (normalizedUrl.includes('/map?courseId=cc')) {
        return jsonResponse(mapResponse);
      }

      if (normalizedUrl.includes('/map?courseId=si')) {
        return jsonResponse(siMapResponse);
      }

      throw new Error(`Rota inesperada no teste: ${normalizedUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/Bom ver voc[eê] por aqui, Lucas\./i)).toBeTruthy();
    });

    const [courseSelect] = screen.getAllByRole('combobox');
    fireEvent.change(courseSelect, { target: { value: 'si' } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/map?courseId=si'))).toBe(true);
    });
  });
});
