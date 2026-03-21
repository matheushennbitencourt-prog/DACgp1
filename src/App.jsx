import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import './App.css';
import {
  boardMetrics,
  buildBoardLayout,
  formatRegistration,
  getBoardConnectorPath,
  getCriticalSubjects,
  getInitialForm,
  getInitials,
  getNextSubjects,
  getSettingsForm,
  getTrailOrder,
  getTrailSlug,
  getTrailSummary,
  groupBySemester,
  normalizeRegistration,
  normalizeSettingsForCompare,
  pageLabels,
  statusLabels,
  themeOptions,
  validateAuthForm,
  validateSettingsForm,
} from './app-utils.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_FALLBACK_URL = 'http://localhost:3001/api';
const TOKEN_STORAGE_KEY = 'coursemapper_token';
const THEME_STORAGE_KEY = 'coursemapper_theme';

const getStoredToken = () => window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
const setStoredToken = (token) => token ? window.localStorage.setItem(TOKEN_STORAGE_KEY, token) : window.localStorage.removeItem(TOKEN_STORAGE_KEY);
const getStoredTheme = () => window.localStorage.getItem(THEME_STORAGE_KEY) || 'brand';
const setStoredTheme = (theme) => window.localStorage.setItem(THEME_STORAGE_KEY, theme);
const shouldUseLocalApiFallback = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

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
                {curriculums.map((curriculum) => <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>)}
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

function Sidebar({ user, currentPage, setCurrentPage, selectedCourseId, setSelectedCourseId, curriculums, mapData, onLogout }) {
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
            <button key={page} type="button" className={`nav-button ${currentPage === page ? 'is-active' : ''}`} onClick={() => startTransition(() => setCurrentPage(page))}>{label}</button>
          ))}
        </div>
      </div>
      <div className="sidebar-block">
        <p className="sidebar-label">Currículo</p>
        <select className="sidebar-select" value={selectedCourseId} onChange={(event) => startTransition(() => setSelectedCourseId(event.target.value))}>
          {curriculums.map((curriculum) => <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>)}
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

function OverviewPage({ mapData, user, curriculums, setCurrentPage }) {
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
            <button type="button" className="primary-button" onClick={() => startTransition(() => setCurrentPage('curriculum'))}>Ver currículo completo</button>
            <button type="button" className="soft-button" onClick={() => startTransition(() => setCurrentPage('settings'))}>Abrir configurações</button>
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

function BoardPage({ mapData, actionLoadingId, onToggleSubject }) {
  const semesters = [...new Set(mapData.subjects.map((subject) => subject.semester))].sort((a, b) => a - b);
  const trailOrder = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const layout = buildBoardLayout(mapData.subjects, trailOrder, semesters);
  const prerequisiteEdges = mapData.subjects.flatMap((subject) => subject.prerequisites
    .filter((prerequisiteId) => layout.placements.has(prerequisiteId))
    .map((prerequisiteId) => ({
      id: `${prerequisiteId}-${subject.id}`,
      type: 'prerequisite',
      from: layout.placements.get(prerequisiteId),
      to: layout.placements.get(subject.id),
    })));
  const corequisiteEdges = mapData.subjects.flatMap((subject) => subject.corequisites
    .filter((corequisiteId) => layout.placements.has(corequisiteId) && subject.id.localeCompare(corequisiteId) < 0)
    .map((corequisiteId) => ({
      id: `${subject.id}-${corequisiteId}`,
      type: 'corequisite',
      from: layout.placements.get(subject.id),
      to: layout.placements.get(corequisiteId),
    })));

  return (
    <div className="page-grid">
      <section className="page-header-card">
        <p className="section-kicker">Quadro</p>
        <h1>Leitura visual das cadeiras</h1>
        <p>Uma versão mais diagramática do currículo, organizada por trilha e semestre, para enxergar dependências e caminhos de forma imediata.</p>
      </section>
      <section className="surface-card board-page-card">
        <div className="card-heading">
          <div><p className="section-kicker">Mapa por fluxo</p><h3>{mapData.course.name}</h3></div>
          <div className="board-legend">
            <span className="legend-item"><i className="legend-line prerequisite" />Pre-requisito</span>
            <span className="legend-item"><i className="legend-line corequisite" />Correquisito</span>
          </div>
        </div>
        <div className="board-scroll">
          <div className="board-canvas" style={{ width: `${layout.width}px`, height: `${layout.height}px` }}>
            <svg className="board-grid" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
              <line x1={boardMetrics.labelColumnWidth} y1="14" x2={boardMetrics.labelColumnWidth} y2={layout.height} className="board-divider major" />
              {semesters.map((semester, index) => (
                <line
                  key={semester}
                  x1={boardMetrics.labelColumnWidth + (index * boardMetrics.columnWidth)}
                  y1="14"
                  x2={boardMetrics.labelColumnWidth + (index * boardMetrics.columnWidth)}
                  y2={layout.height}
                  className={`board-divider ${index === 0 ? 'major' : ''}`}
                />
              ))}
              {layout.rowMeta.map((row) => (
                <rect
                  key={row.trail}
                  x={boardMetrics.labelColumnWidth + 10}
                  y={row.y}
                  width={layout.width - boardMetrics.labelColumnWidth - 20}
                  height={row.height}
                  rx="22"
                  className={`board-row-band trail-${getTrailSlug(row.trail)}`}
                />
              ))}
              {[...prerequisiteEdges, ...corequisiteEdges].map((edge) => (
                <path
                  key={edge.id}
                  d={getBoardConnectorPath(edge.from, edge.to)}
                  className={`board-edge ${edge.type}`}
                />
              ))}
            </svg>

            {semesters.map((semester, index) => (
              <div
                key={semester}
                className="board-semester-label"
                style={{
                  left: `${boardMetrics.labelColumnWidth + (index * boardMetrics.columnWidth) + (boardMetrics.columnWidth / 2)}px`,
                  top: '8px',
                }}
              >
                <span>{semester}o semestre</span>
              </div>
            ))}

            {layout.rowMeta.map((row) => (
              <div
                key={row.trail}
                className={`board-trail-label trail-${getTrailSlug(row.trail)}`}
                style={{
                  left: '0px',
                  top: `${row.y + (row.height / 2)}px`,
                }}
              >
                <span>{row.trail}</span>
              </div>
            ))}

            {mapData.subjects.map((subject) => {
              const placement = layout.placements.get(subject.id);
              if (!placement) return null;

              return (
                <button
                  key={subject.id}
                  type="button"
                  className={`board-node status-${subject.status} trail-${getTrailSlug(subject.trail)} ${subject.isCritical ? 'is-critical' : ''}`}
                  style={{
                    left: `${placement.x}px`,
                    top: `${placement.y}px`,
                    width: `${placement.width}px`,
                    height: `${placement.height}px`,
                  }}
                  onClick={() => onToggleSubject(subject)}
                  disabled={actionLoadingId === subject.id || subject.status === 'locked'}
                >
                  <span className="board-node-check" aria-hidden="true" />
                  <div className="board-node-content">
                    <div className="board-node-topline">
                      <strong>{subject.name}</strong>
                      <span>{subject.id}</span>
                    </div>
                    <p>{statusLabels[subject.status]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
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
  settingsLoading,
  settingsError,
  settingsSuccess,
  setTheme,
  hasSettingsChanges,
}) {
  const [currentPage, setCurrentPage] = useState('overview');
  const deferredMapData = useDeferredValue(mapData);
  let pageContent = null;

  useEffect(() => {
    document.title = currentPage === 'overview'
      ? 'CourseMapper'
      : `${pageLabels[currentPage]} | CourseMapper`;
  }, [currentPage]);

  if (deferredMapData) {
    if (currentPage === 'overview') {
      pageContent = <OverviewPage mapData={deferredMapData} user={user} curriculums={curriculums} setCurrentPage={setCurrentPage} />;
    }

    if (currentPage === 'curriculum') {
      pageContent = <CurriculumPage mapData={deferredMapData} actionLoadingId={actionLoadingId} onToggleSubject={onToggleSubject} />;
    }

    if (currentPage === 'board') {
      pageContent = <BoardPage mapData={deferredMapData} actionLoadingId={actionLoadingId} onToggleSubject={onToggleSubject} />;
    }

    if (currentPage === 'analytics') {
      pageContent = <AnalyticsPage mapData={deferredMapData} />;
    }

    if (currentPage === 'settings') {
      pageContent = (
        <SettingsPage
          user={user}
          settingsForm={settingsForm}
          setSettingsForm={setSettingsForm}
          onSaveProfile={onSaveProfile}
          settingsLoading={settingsLoading}
          settingsError={settingsError}
          settingsSuccess={settingsSuccess}
          setTheme={setTheme}
          hasSettingsChanges={hasSettingsChanges}
        />
      );
    }
  }

  return (
    <div className="dashboard-shell">
      <Sidebar
        user={user}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        selectedCourseId={selectedCourseId}
        setSelectedCourseId={setSelectedCourseId}
        curriculums={curriculums}
        mapData={deferredMapData}
        onLogout={onLogout}
      />
      <main className="dashboard-main">
        <header className="main-header">
          <div><p className="section-kicker">Workspace</p><h1>{pageLabels[currentPage]}</h1></div>
          <div className="header-meta"><span>{mapData?.course.code || '--'}</span><span>{mapData?.stats.completionRate ?? 0}% concluído</span></div>
        </header>
        {dashboardError ? <p className="banner-error">{dashboardError}</p> : null}
        {mapLoading ? <p className="loading-copy">Carregando painel...</p> : pageContent}
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
  const [authLoading, setAuthLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [authError, setAuthError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const hasSettingsChanges = JSON.stringify(normalizeSettingsForCompare(settingsForm)) !== JSON.stringify(normalizeSettingsForCompare(getSettingsForm(user, theme)));

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
        : { ...form, registration: normalizeRegistration(form.registration), email: form.email.trim(), name: form.name.trim() };
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
    }
  }

  async function handleToggleSubject(subject) {
    if (!token || subject.status === 'locked') return;
    setActionLoadingId(subject.id);
    setDashboardError('');

    try {
      const response = await apiRequest('/progress/toggle', {
        method: 'POST',
        body: JSON.stringify({
          courseId: selectedCourseId,
          subjectId: subject.id,
          completed: subject.status !== 'completed',
        }),
      }, token);
      setMapData(response);
    } catch (error) {
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
          email: settingsForm.email.trim(),
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
      settingsLoading={settingsLoading}
      settingsError={settingsError}
      settingsSuccess={settingsSuccess}
      setTheme={setTheme}
      hasSettingsChanges={hasSettingsChanges}
    />
  );
}
