import { lazy, Suspense, startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import {
  buildOptimisticMapData,
  canOptimisticallyToggleSubject,
  formatRegistration,
  getCurriculumVersionLabel,
  getFirstCurriculumIdForCatalog,
  getCriticalSubjects,
  getInitialForm,
  getInitials,
  getNextSubjects,
  getSettingsForm,
  getTrailSummary,
  groupCurriculumsByCatalog,
  groupBySemester,
  normalizeRegistration,
  normalizeSettingsForCompare,
  pageLabels,
  resolveCurriculumId,
  statusLabels,
  themeOptions,
  validateAuthForm,
  validateSettingsForm,
} from './app-utils.js';

const loadBoardPage = () => import('./pages/BoardPage.jsx');
const BoardPage = lazy(loadBoardPage);
let boardPagePreloadPromise;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_FALLBACK_URL = 'http://localhost:3001/api';
const TOKEN_STORAGE_KEY = 'coursemapper_token';
const THEME_STORAGE_KEY = 'coursemapper_theme';

const getStoredToken = () => window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
const setStoredToken = (token) => token ? window.localStorage.setItem(TOKEN_STORAGE_KEY, token) : window.localStorage.removeItem(TOKEN_STORAGE_KEY);
const getStoredTheme = () => window.localStorage.getItem(THEME_STORAGE_KEY) || 'brand';
const setStoredTheme = (theme) => window.localStorage.setItem(THEME_STORAGE_KEY, theme);
const shouldUseLocalApiFallback = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
const preloadBoardPage = () => {
  if (!boardPagePreloadPromise) {
    boardPagePreloadPromise = loadBoardPage();
  }

  return boardPagePreloadPromise;
};

function scheduleBoardPreload() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(() => {
      preloadBoardPage();
    }, { timeout: 1200 });

    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = window.setTimeout(() => {
    preloadBoardPage();
  }, 300);

  return () => window.clearTimeout(timeoutId);
}

async function parseApiResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();

  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error('A API retornou HTML em vez de JSON. Reinicie o backend para carregar as rotas mais recentes.');
  }

  throw new Error(text || 'Resposta inválida da API.');
}

async function apiRequest(path, options = {}, token = '') {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function runRequest(baseUrl) {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(data?.error || 'Algo deu errado.');
    }

    return data;
  }

  try {
    return await runRequest(API_BASE_URL);
  } catch (error) {
    const shouldRetryWithFallback =
      API_BASE_URL === '/api' &&
      shouldUseLocalApiFallback() &&
      error instanceof Error &&
      error.message === 'A API retornou HTML em vez de JSON.';

    if (!shouldRetryWithFallback) {
      throw error;
    }

    return runRequest(API_FALLBACK_URL);
  }
}

function ThemeControl({ theme, setTheme }) {
  return (
    <div className="theme-picker settings-theme">
      <span>Tema do site</span>
      <div className="theme-switcher" role="radiogroup" aria-label="Selecionar tema">
        {themeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`theme-option ${theme === option.id ? 'is-active' : ''}`}
            aria-pressed={theme === option.id}
            onClick={() => setTheme(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar({ user, large = false }) {
  if (user?.avatarUrl) {
    return <img className={`avatar ${large ? 'large' : ''}`} src={user.avatarUrl} alt={`Foto de perfil de ${user.name}`} />;
  }
  return <div className={`avatar avatar-fallback ${large ? 'large' : ''}`}>{getInitials(user?.name)}</div>;
}

function AuthScreen({ authMode, form, setForm, onSubmit, setAuthMode, loading, error, curriculums }) {
  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-badge">DACathon 2026</div>
        <h1>CourseMapper</h1>
        <p className="auth-copy">Um painel acadêmico mais calmo, visual e objetivo para acompanhar disciplinas, trilhas, progresso e o caminho crítico do curso.</p>
        <div className="auth-panels">
          <article><span className="panel-kicker">Organização</span><strong>Visão clara por semestre</strong><p>Menos ruído visual e mais foco no que desbloqueia sua próxima etapa.</p></article>
          <article><span className="panel-kicker">Planejamento</span><strong>Análises de progresso</strong><p>Percentual concluído, matérias liberadas e leitura do caminho crítico.</p></article>
          <article><span className="panel-kicker">Perfil</span><strong>Configurações pessoais</strong><p>Depois do login você consegue editar foto, dados do perfil e tema do site.</p></article>
        </div>
      </section>
      <section className="auth-card">
        <form className="auth-form" onSubmit={onSubmit}>
          {authMode === 'register' ? (
            <label>Nome completo
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Lucas Oliveira" />
            </label>
          ) : null}
          <label>Matrícula
            <input value={form.registration} onChange={(event) => setForm((current) => ({ ...current, registration: formatRegistration(event.target.value) }))} placeholder="2026 000001" inputMode="numeric" maxLength={11} />
          </label>
          {authMode === 'register' ? (
            <label>E-mail
              <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="lucas@faculdade.edu.br" autoComplete="email" />
            </label>
          ) : null}
          <label>Senha
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Mínimo de 4 caracteres" minLength={4} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {authMode === 'register' ? (
            <label>Curso
              <select value={form.courseId} onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}>
                {curriculums.map((curriculum) => <option key={curriculum.id} value={curriculum.id}>{`${curriculum.name} - ${getCurriculumVersionLabel(curriculum)}`}</option>)}
              </select>
            </label>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="auth-actions">
            <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Processando...' : authMode === 'login' ? 'Entrar' : 'Cadastrar-se'}</button>
            <button type="button" className="soft-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} disabled={loading}>
              {authMode === 'login' ? 'Cadastrar-se' : 'Entrar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Sidebar({
  user,
  currentPage,
  onNavigate,
  onPrefetchBoard,
  selectedCatalogKey,
  onSelectCatalogKey,
  selectedCourseId,
  setSelectedCourseId,
  curriculumGroups,
  mapData,
  onLogout,
}) {
  const selectedGroup = curriculumGroups.find((group) => group.key === selectedCatalogKey) || curriculumGroups[0] || null;

  return (
    <aside className="sidebar">
      <div className="sidebar-block">
        <div className="brand-mark">CM</div>
        <div><p className="sidebar-label">Painel acadêmico</p><h2>CourseMapper</h2></div>
      </div>
      <div className="sidebar-block">
        <p className="sidebar-label">Navegação</p>
        <div className="nav-list">
          {Object.entries(pageLabels).map(([page, label]) => (
            <button
              key={page}
              type="button"
              className={`nav-button ${currentPage === page ? 'is-active' : ''}`}
              onClick={() => onNavigate(page)}
              onMouseEnter={page === 'board' ? onPrefetchBoard : undefined}
              onFocus={page === 'board' ? onPrefetchBoard : undefined}
              onTouchStart={page === 'board' ? onPrefetchBoard : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-block">
        <p className="sidebar-label">Curso</p>
        <select className="sidebar-select" value={selectedCatalogKey} onChange={(event) => onSelectCatalogKey(event.target.value)}>
          {curriculumGroups.map((group) => <option key={group.key} value={group.key}>{group.code ? `${group.code} - ${group.name}` : group.name}</option>)}
        </select>
        <p className="sidebar-label">Versao da grade</p>
        <select className="sidebar-select" value={selectedCourseId} onChange={(event) => startTransition(() => setSelectedCourseId(event.target.value))}>
          {(selectedGroup?.versions || []).map((curriculum) => (
            <option key={curriculum.id} value={curriculum.id}>
              {getCurriculumVersionLabel(curriculum)}
            </option>
          ))}
        </select>
        <div className="tag-list">
          {(mapData?.course.trailLabels || []).map((trail) => <span key={trail}>{trail}</span>)}
        </div>
      </div>
      <div className="sidebar-user">
        <div className="sidebar-user-main">
          <Avatar user={user} />
          <div>
            <strong>{user.name}</strong>
            <p>@{user.username || 'usuario'}</p>
            <p>{formatRegistration(user.registration)}</p>
          </div>
        </div>
        <button type="button" className="ghost-button dark" onClick={onLogout}>Sair</button>
      </div>
    </aside>
  );
}

function OverviewPage({ mapData, user, curriculums, onNavigate }) {
  const availableSubjects = getNextSubjects(mapData.subjects);
  const criticalSubjects = getCriticalSubjects(mapData.subjects).slice(0, 4);
  const userCourse = curriculums.find((item) => item.id === user.courseId);
  return (
    <div className="page-grid">
      <section className="hero-card">
        <div className="hero-content">
          <p className="section-kicker">Visão geral</p>
          <h1>Bom ver você por aqui, {user.name.split(' ')[0]}.</h1>
          <p>Seu curso padrão é <strong>{userCourse?.name}</strong>. O painel abaixo resume o seu momento acadêmico e mostra o que merece mais atenção agora.</p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => onNavigate('curriculum')}>Ver currículo completo</button>
            <button type="button" className="soft-button" onClick={() => onNavigate('settings')}>Abrir configurações</button>
          </div>
        </div>
      </section>
      <section className="stats-strip">
        <article className="metric-card"><span>Conclusão</span><strong>{mapData.stats.completionRate}%</strong></article>
        <article className="metric-card"><span>Concluídas</span><strong>{mapData.stats.completedCount}</strong></article>
        <article className="metric-card"><span>Disponíveis</span><strong>{mapData.stats.availableCount}</strong></article>
        <article className="metric-card"><span>Semestres restantes</span><strong>{mapData.stats.remainingCriticalSemesters}</strong></article>
      </section>
      <section className="content-grid two-columns">
        <article className="surface-card">
          <div className="card-heading"><div><p className="section-kicker">Próximos passos</p><h3>Disciplinas prontas para cursar</h3></div></div>
          <div className="stack-list">
            {availableSubjects.map((subject) => (
              <div key={subject.id} className="list-row">
                <div><strong>{subject.name}</strong><p>{subject.id} • {subject.trail}</p></div>
                <span className="status-pill available">Disponível</span>
              </div>
            ))}
            {availableSubjects.length === 0 ? <p className="empty-copy">Nenhuma disciplina liberada agora.</p> : null}
          </div>
        </article>
        <article className="surface-card">
          <div className="card-heading"><div><p className="section-kicker">Caminho crítico</p><h3>Matérias que puxam o plano</h3></div></div>
          <div className="stack-list">
            {criticalSubjects.map((subject) => (
              <div key={subject.id} className="list-row">
                <div><strong>{subject.name}</strong><p>{subject.id} • {statusLabels[subject.status]}</p></div>
                <span className="critical-chip">Crítico</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function CurriculumPage({ mapData, actionLoadingId, onToggleSubject }) {
  const groupedSubjects = groupBySemester(mapData.subjects);
  const orderedSemesters = Object.keys(groupedSubjects).sort((a, b) => Number(a) - Number(b));
  return (
    <div className="page-grid">
      <section className="page-header-card">
        <p className="section-kicker">Currículo</p>
        <h1>{mapData.course.name}</h1>
        <p>Uma leitura limpa por semestre, com estados visuais discretos e destaque para o que está mais perto de destravar o curso.</p>
      </section>
      <section className="semester-grid refined">
        {orderedSemesters.map((semester) => (
          <article key={semester} className="surface-card semester-surface">
            <div className="card-heading">
              <div><p className="section-kicker">Semestre</p><h3>{semester}º período</h3></div>
              <span className="small-counter">{groupedSubjects[semester].length} matérias</span>
            </div>
            <div className="subject-list">
              {groupedSubjects[semester].map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className={`subject-card status-${subject.status} ${subject.isCritical ? 'is-critical' : ''}`}
                  onClick={() => onToggleSubject(subject)}
                  disabled={actionLoadingId === subject.id || subject.status === 'locked'}
                >
                  <div className="subject-topline"><strong>{subject.id}</strong><span>{statusLabels[subject.status]}</span></div>
                  <h4>{subject.name}</h4>
                  <p className="subject-meta">Trilha: <strong>{subject.trail}</strong></p>
                  <p className="subject-meta">Pre-requisitos: <strong>{subject.prerequisites.length > 0 ? subject.prerequisites.join(', ') : 'Nenhum'}</strong></p>
                  <p className="subject-meta">Correquisitos: <strong>{subject.corequisites.length > 0 ? subject.corequisites.join(', ') : 'Nenhum'}</strong></p>
                  <div className="subject-footer">
                    {subject.isCritical ? <span className="critical-chip">Caminho crítico</span> : <span className="muted-chip">Fluxo normal</span>}
                    <span className="action-hint">{actionLoadingId === subject.id ? 'Salvando...' : subject.status === 'completed' ? 'Clique para desfazer' : subject.status === 'available' ? 'Clique para concluir' : 'Bloqueada'}</span>
                  </div>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function AnalyticsPage({ mapData }) {
  const trailSummary = getTrailSummary(mapData.subjects);
  const completion = mapData.stats.completionRate;
  return (
    <div className="page-grid">
      <section className="page-header-card">
        <p className="section-kicker">Análises</p>
        <h1>Leitura do progresso</h1>
        <p>Um retrato rápido do que já foi concluído, das trilhas mais fortes e do quanto ainda falta para terminar o caminho principal.</p>
      </section>
      <section className="content-grid two-columns">
        <article className="surface-card progress-card">
          <div className="card-heading"><div><p className="section-kicker">Ritmo geral</p><h3>Conclusão do curso</h3></div></div>
          <div className="progress-ring" style={{ '--progress-value': `${completion}%` }}><div className="progress-ring-inner"><strong>{completion}%</strong><span>concluído</span></div></div>
          <p className="support-copy">{mapData.stats.completedCount} de {mapData.stats.totalSubjects} disciplinas concluídas.</p>
        </article>
        <article className="surface-card">
          <div className="card-heading"><div><p className="section-kicker">Estimativa</p><h3>Tempo restante</h3></div></div>
          <div className="timeline-callout"><strong>{mapData.stats.remainingCriticalSemesters}</strong><span>semestres no caminho crítico</span></div>
          <p className="support-copy">Considerando que todas as disciplinas abrem em todos os semestres, este número ajuda a enxergar o mínimo teórico para concluir o fluxo principal.</p>
        </article>
      </section>
      <section className="surface-card">
        <div className="card-heading"><div><p className="section-kicker">Trilhas</p><h3>Distribuição por área</h3></div></div>
        <div className="trail-grid">
          {trailSummary.map((item) => (
            <article key={item.trail} className="trail-card">
              <strong>{item.trail}</strong>
              <span>{item.completed}/{item.total} concluídas</span>
              <div className="mini-bar"><div style={{ width: `${item.completionRate}%` }} /></div>
              <p>{item.completionRate}% de aproveitamento nesta trilha</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsPage({
  user,
  settingsForm,
  setSettingsForm,
  onSaveProfile,
  onImportCurriculum,
  importForm,
  setImportForm,
  importLoading,
  importError,
  importSuccess,
  settingsLoading,
  settingsError,
  settingsSuccess,
  setTheme,
  hasSettingsChanges,
}) {
  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      reader.readAsDataURL(file);
    });
    setSettingsForm((current) => ({ ...current, avatarUrl: dataUrl }));
  }

  async function handleCurriculumFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const normalizedFileName = String(file.name || '').toLowerCase();
    const isBinaryGrade = normalizedFileName.endsWith('.pdf') || normalizedFileName.endsWith('.docx');

    if (isBinaryGrade) {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo da grade.'));
        reader.readAsDataURL(file);
      });

      setImportForm((current) => ({
        ...current,
        fileData,
        fileName: file.name,
        mimeType: file.type || '',
        sourceText: '',
      }));

      return;
    }

    const sourceText = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo da grade.'));
      reader.readAsText(file, 'utf-8');
    });

    setImportForm((current) => ({
      ...current,
      fileData: '',
      fileName: file.name,
      mimeType: file.type || '',
      sourceText,
    }));
  }

  return (
    <div className="page-grid">
      <section className="page-header-card">
        <p className="section-kicker">Configurações</p>
        <h1>Seu perfil e preferências</h1>
        <p>Atualize sua foto, nome de usuário, dados da conta e o tema do site em um único lugar.</p>
      </section>
      <section className="content-grid two-columns settings-layout">
        <article className="surface-card">
          <div className="card-heading"><div><p className="section-kicker">Foto de perfil</p><h3>Identidade visual</h3></div></div>
          <div className="settings-avatar-block">
            <Avatar user={{ name: settingsForm.name || user.name, avatarUrl: settingsForm.avatarUrl }} large />
            <div className="settings-avatar-copy">
              <strong>Imagem do usuário</strong>
              <p>Envie uma imagem do seu dispositivo para personalizar o painel com mais estabilidade.</p>
              <div className="settings-avatar-actions">
                <label className="upload-button">Escolher imagem<input type="file" accept="image/*" onChange={handleAvatarChange} /></label>
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => setSettingsForm((current) => ({ ...current, avatarUrl: '' }))}
                  disabled={!settingsForm.avatarUrl}
                >
                  Remover foto
                </button>
              </div>
            </div>
          </div>
        </article>
        <article className="surface-card">
          <div className="card-heading"><div><p className="section-kicker">Tema</p><h3>Aparência do site</h3></div></div>
          <ThemeControl
            theme={settingsForm.theme}
            setTheme={(nextTheme) => {
              setSettingsForm((current) => ({ ...current, theme: nextTheme }));
              setTheme(nextTheme);
            }}
          />
        </article>
      </section>
      <section className="surface-card">
        <div className="card-heading"><div><p className="section-kicker">Dados pessoais</p><h3>Editar perfil</h3></div></div>
        <form className="settings-form" onSubmit={onSaveProfile}>
          <label>Nome completo<input value={settingsForm.name} onChange={(event) => setSettingsForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Nome de usuário<input value={settingsForm.username} onChange={(event) => setSettingsForm((current) => ({ ...current, username: event.target.value.replace(/\s+/g, '') }))} /></label>
          <label>E-mail<input type="email" value={settingsForm.email} onChange={(event) => setSettingsForm((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Matrícula<input value={formatRegistration(user.registration)} disabled /></label>
          {settingsError ? <p className="form-error">{settingsError}</p> : null}
          {settingsSuccess ? <p className="form-success">{settingsSuccess}</p> : null}
          <div className="settings-actions"><button type="submit" className="primary-button" disabled={settingsLoading || !hasSettingsChanges}>{settingsLoading ? 'Salvando...' : 'Salvar configurações'}</button></div>
        </form>
      </section>
      <section className="surface-card">
        <div className="card-heading"><div><p className="section-kicker">Grade curricular</p><h3>Importar nova grade</h3></div></div>
        <form className="settings-form" onSubmit={onImportCurriculum}>
          <label>Nome do arquivo
            <input
              value={importForm.fileName}
              onChange={(event) => setImportForm((current) => ({ ...current, fileName: event.target.value }))}
              placeholder="grade-curricular.txt"
            />
          </label>
          <label>Arquivo da grade
            <span className="upload-button">Selecionar arquivo<input type="file" accept=".txt,.csv,.json,.md,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleCurriculumFileChange} /></span>
          </label>
          <label className="settings-textarea-field">Conteudo da grade
            <textarea
              value={importForm.sourceText}
              onChange={(event) => setImportForm((current) => ({ ...current, sourceText: event.target.value }))}
              placeholder="Cole aqui a grade curricular em texto, CSV ou JSON. Para PDF e DOCX, a OpenAI estrutura pre e correquisitos no backend."
              rows={10}
            />
          </label>
          {importError ? <p className="form-error">{importError}</p> : null}
          {importSuccess ? <p className="form-success">{importSuccess}</p> : null}
          <div className="settings-actions"><button type="submit" className="primary-button" disabled={importLoading || !(importForm.sourceText.trim() || importForm.fileData)}>{importLoading ? 'Importando...' : 'Importar grade'}</button></div>
        </form>
      </section>
    </div>
  );
}

function Dashboard({
  user,
  curriculums,
  selectedCourseId,
  setSelectedCourseId,
  mapData,
  mapLoading,
  actionLoadingId,
  onToggleSubject,
  onLogout,
  dashboardError,
  settingsForm,
  setSettingsForm,
  onSaveProfile,
  onImportCurriculum,
  importForm,
  setImportForm,
  importLoading,
  importError,
  importSuccess,
  settingsLoading,
  settingsError,
  settingsSuccess,
  setTheme,
  hasSettingsChanges,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const deferredSidebarMapData = useDeferredValue(mapData);
  const routeKey = location.pathname.replace(/^\//, '') || 'overview';
  const currentPage = pageLabels[routeKey] ? routeKey : 'overview';
  const curriculumGroups = groupCurriculumsByCatalog(curriculums);
  const selectedCurriculum = curriculums.find((item) => item.id === selectedCourseId) || curriculumGroups[0]?.versions?.[0] || null;
  const selectedCatalogKey = selectedCurriculum?.catalogKey || curriculumGroups[0]?.key || '';

  function handleNavigate(page) {
    if (page === 'board') {
      preloadBoardPage();
    }

    const nextPath = page === 'overview' ? '/' : `/${page}`;
    startTransition(() => navigate(nextPath));
  }

  function handleSelectCatalogKey(nextCatalogKey) {
    const nextCourseId = getFirstCurriculumIdForCatalog(curriculums, nextCatalogKey);

    if (!nextCourseId) {
      return;
    }

    startTransition(() => setSelectedCourseId(nextCourseId));
  }

  useEffect(() => {
    document.title = currentPage === 'overview'
      ? 'CourseMapper'
      : `${pageLabels[currentPage]} | CourseMapper`;
  }, [currentPage]);

  useEffect(() => {
    if (!mapData || currentPage === 'board') {
      return undefined;
    }

    return scheduleBoardPreload();
  }, [currentPage, mapData]);

  return (
    <div className="dashboard-shell">
      <Sidebar
        user={user}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onPrefetchBoard={preloadBoardPage}
        selectedCatalogKey={selectedCatalogKey}
        onSelectCatalogKey={handleSelectCatalogKey}
        selectedCourseId={selectedCourseId}
        setSelectedCourseId={setSelectedCourseId}
        curriculumGroups={curriculumGroups}
        mapData={deferredSidebarMapData}
        onLogout={onLogout}
      />
      <main className="dashboard-main">
        <header className="main-header">
          <div><p className="section-kicker">Workspace</p><h1>{pageLabels[currentPage]}</h1></div>
          <div className="header-meta">
            <span>{mapData?.course.baseCode || mapData?.course.code || '--'}</span>
            <span>{mapData?.course.versionLabel || 'Grade padrao'}</span>
            <span>{mapData?.stats.completionRate ?? 0}% concluído</span>
          </div>
        </header>
        {dashboardError ? <p className="banner-error">{dashboardError}</p> : null}
        {mapLoading ? <p className="loading-copy">Carregando painel...</p> : (
          <Routes>
            <Route path="/" element={mapData ? <OverviewPage mapData={mapData} user={user} curriculums={curriculums} onNavigate={handleNavigate} /> : null} />
            <Route path="/curriculum" element={mapData ? <CurriculumPage mapData={mapData} actionLoadingId={actionLoadingId} onToggleSubject={onToggleSubject} /> : null} />
            <Route
              path="/board"
              element={mapData ? (
                <Suspense fallback={<p className="loading-copy">Preparando quadro de cadeiras...</p>}>
                  <BoardPage mapData={mapData} actionLoadingId={actionLoadingId} onToggleSubject={onToggleSubject} />
                </Suspense>
              ) : null}
            />
            <Route path="/analytics" element={mapData ? <AnalyticsPage mapData={mapData} /> : null} />
            <Route
              path="/settings"
              element={mapData ? (
                <SettingsPage
                  user={user}
                  settingsForm={settingsForm}
                  setSettingsForm={setSettingsForm}
                  onSaveProfile={onSaveProfile}
                  onImportCurriculum={onImportCurriculum}
                  importForm={importForm}
                  setImportForm={setImportForm}
                  importLoading={importLoading}
                  importError={importError}
                  importSuccess={importSuccess}
                  settingsLoading={settingsLoading}
                  settingsError={settingsError}
                  settingsSuccess={settingsSuccess}
                  setTheme={setTheme}
                  hasSettingsChanges={hasSettingsChanges}
                />
              ) : null}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(getStoredToken);
  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState(getInitialForm);
  const [curriculums, setCurriculums] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState('cc');
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(getStoredTheme);
  const [settingsForm, setSettingsForm] = useState(getSettingsForm(null, getStoredTheme()));
  const [importForm, setImportForm] = useState({ fileData: '', fileName: '', mimeType: '', sourceText: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [authError, setAuthError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const persistedTheme = user?.preferences?.theme || getStoredTheme();
  const hasSettingsChanges = JSON.stringify(normalizeSettingsForCompare(settingsForm)) !== JSON.stringify(normalizeSettingsForCompare(getSettingsForm(user, persistedTheme)));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    async function loadCurriculums() {
      try {
        const response = await apiRequest('/curriculums');
        setCurriculums(response);
      } catch (error) {
        setAuthError(error.message);
      }
    }

    loadCurriculums();
  }, []);

  useEffect(() => {
    async function bootstrapSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiRequest('/auth/me', {}, token);
        setUser(response.user);
        setSelectedCourseId(response.user.courseId);
        const nextTheme = response.user.preferences?.theme || getStoredTheme();
        setTheme(nextTheme);
        setSettingsForm(getSettingsForm(response.user, nextTheme));
      } catch {
        setStoredToken('');
        setToken('');
      } finally {
        setLoading(false);
      }
    }

    bootstrapSession();
  }, [token]);

  useEffect(() => {
    if (curriculums.length === 0) {
      return;
    }

    const nextCourseId = resolveCurriculumId(curriculums, selectedCourseId || user?.courseId || '');

    if (nextCourseId && nextCourseId !== selectedCourseId) {
      setSelectedCourseId(nextCourseId);
    }
  }, [curriculums, selectedCourseId, user]);

  useEffect(() => {
    async function loadMap() {
      if (!token || !user || !selectedCourseId) {
        return;
      }

      setMapLoading(true);
      setDashboardError('');

      try {
        const response = await apiRequest(`/map?courseId=${selectedCourseId}`, {}, token);
        setMapData(response);
      } catch (error) {
        setDashboardError(error.message);
      } finally {
        setMapLoading(false);
      }
    }

    loadMap();
  }, [selectedCourseId, token, user]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const validationError = validateAuthForm(authMode, form);
      if (validationError) throw new Error(validationError);

      const path = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login'
        ? { registration: normalizeRegistration(form.registration), password: form.password }
        : {
            ...form,
            registration: normalizeRegistration(form.registration),
            email: form.email.trim().toLowerCase(),
            name: form.name.trim(),
          };
      const response = await apiRequest(path, { method: 'POST', body: JSON.stringify(payload) });

      const nextTheme = response.user.preferences?.theme || 'brand';
      setStoredToken(response.token);
      setToken(response.token);
      setUser(response.user);
      setTheme(nextTheme);
      setSettingsForm(getSettingsForm(response.user, nextTheme));
      setSelectedCourseId(response.user.courseId);
      setForm(getInitialForm());
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' }, token);
    } catch {
      // logout local mesmo se o backend falhar
    } finally {
      setStoredToken('');
      setToken('');
      setUser(null);
      setMapData(null);
      setSelectedCourseId('cc');
      setAuthMode('login');
      setForm(getInitialForm());
      setSettingsForm(getSettingsForm(null, getStoredTheme()));
      setSettingsError('');
      setSettingsSuccess('');
      setImportForm({ fileData: '', fileName: '', mimeType: '', sourceText: '' });
      setImportError('');
      setImportSuccess('');
    }
  }

  async function handleToggleSubject(subject) {
    if (!token || subject.status === 'locked') return;

    const guard = canOptimisticallyToggleSubject(mapData, subject);
    if (!guard.allowed) {
      setDashboardError(guard.error);
      return;
    }

    const previousMapData = mapData;
    const shouldComplete = subject.status !== 'completed';
    setActionLoadingId(subject.id);
    setDashboardError('');

    if (previousMapData) {
      setMapData(buildOptimisticMapData(previousMapData, subject.id, shouldComplete));
    }

    try {
      const response = await apiRequest('/progress/toggle', {
        method: 'POST',
        body: JSON.stringify({
          courseId: selectedCourseId,
          subjectId: subject.id,
          completed: shouldComplete,
        }),
      }, token);
      setMapData(response);
    } catch (error) {
      if (previousMapData) {
        setMapData(previousMapData);
      }
      setDashboardError(error.message);
    } finally {
      setActionLoadingId('');
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setSettingsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');

    try {
      const validationError = validateSettingsForm(settingsForm);
      if (validationError) throw new Error(validationError);

      const response = await apiRequest('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          username: settingsForm.username.trim(),
          email: settingsForm.email.trim().toLowerCase(),
          avatarUrl: settingsForm.avatarUrl.trim(),
          theme: settingsForm.theme,
        }),
      }, token);

      setUser(response.user);
      setTheme(response.user.preferences?.theme || settingsForm.theme);
      setSettingsForm(getSettingsForm(response.user, response.user.preferences?.theme || settingsForm.theme));
      setSettingsSuccess('Configurações salvas com sucesso.');
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleImportCurriculum(event) {
    event.preventDefault();
    setImportLoading(true);
    setImportError('');
    setImportSuccess('');

    try {
      const response = await apiRequest('/curriculums/import', {
        method: 'POST',
        body: JSON.stringify({
          fileData: importForm.fileData,
          fileName: importForm.fileName.trim(),
          mimeType: importForm.mimeType,
          sourceText: importForm.sourceText,
        }),
      }, token);

      setCurriculums(response.curriculums);
      setSelectedCourseId(response.curriculum.id);
      setImportForm({ fileData: '', fileName: '', mimeType: '', sourceText: '' });
      setImportSuccess(`Grade "${response.curriculum.name}" importada com sucesso.`);
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImportLoading(false);
    }
  }

  if (loading) {
    return <div className="screen-message">Preparando sua área acadêmica...</div>;
  }

  if (!user) {
    return (
      <AuthScreen
        authMode={authMode}
        form={form}
        setForm={setForm}
        onSubmit={handleAuthSubmit}
        setAuthMode={setAuthMode}
        loading={authLoading}
        error={authError}
        curriculums={curriculums}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      curriculums={curriculums}
      selectedCourseId={selectedCourseId}
      setSelectedCourseId={setSelectedCourseId}
      mapData={mapData}
      mapLoading={mapLoading}
      actionLoadingId={actionLoadingId}
      onToggleSubject={handleToggleSubject}
      onLogout={handleLogout}
      dashboardError={dashboardError}
      settingsForm={settingsForm}
      setSettingsForm={setSettingsForm}
      onSaveProfile={handleSaveProfile}
      onImportCurriculum={handleImportCurriculum}
      importForm={importForm}
      setImportForm={setImportForm}
      importLoading={importLoading}
      importError={importError}
      importSuccess={importSuccess}
      settingsLoading={settingsLoading}
      settingsError={settingsError}
      settingsSuccess={settingsSuccess}
      setTheme={setTheme}
      hasSettingsChanges={hasSettingsChanges}
    />
  );
}
