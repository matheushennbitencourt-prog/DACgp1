import { memo, useMemo } from 'react';

import {
  buildBoardModel,
  boardMetrics,
  getBoardConnectorPath,
  getTrailSlug,
  statusLabels,
} from '../app-utils.js';

function MobileBoard({ mapData, actionLoadingId, onToggleSubject, semesters }) {
  return (
    <div className="board-mobile">
      {semesters.map((semester) => {
        const semesterSubjects = mapData.subjects.filter((subject) => subject.semester === semester);

        return (
          <section key={semester} className="board-mobile-section">
            <header className="board-mobile-header">
              <span className="board-mobile-chip">{semester}o semestre</span>
              <strong>{semesterSubjects.length} materias</strong>
            </header>
            <div className="board-mobile-list">
              {semesterSubjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className={`board-mobile-node status-${subject.status} trail-${getTrailSlug(subject.trail)} ${subject.isCritical ? 'is-critical' : ''}`}
                  onClick={() => onToggleSubject(subject)}
                  disabled={actionLoadingId === subject.id || subject.status === 'locked'}
                >
                  <div className="board-mobile-node-topline">
                    <span className={`board-mobile-trail trail-${getTrailSlug(subject.trail)}`}>{subject.trail}</span>
                    <span className="board-mobile-code">{subject.id}</span>
                  </div>
                  <strong>{subject.name}</strong>
                  <p>{statusLabels[subject.status]}</p>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardPage({ mapData, actionLoadingId, onToggleSubject }) {
  const { semesters, layout, edges } = useMemo(() => buildBoardModel(mapData), [mapData]);
  const boardScale = 1.18;
  const scaledWidth = layout.width * boardScale;
  const scaledHeight = layout.height * boardScale;

  return (
    <div className="page-grid">
      <section className="page-header-card">
        <p className="section-kicker">Quadro</p>
        <h1>Leitura visual das cadeiras</h1>
        <p>Uma versao mais diagramatica do curriculo, organizada por trilha e semestre, para enxergar dependencias e caminhos de forma imediata.</p>
      </section>
      <section className="surface-card board-page-card">
        <div className="card-heading">
          <div><p className="section-kicker">Mapa por fluxo</p><h3>{mapData.course.name}</h3></div>
          <div className="board-legend">
            <span className="legend-item"><i className="legend-line prerequisite" />Pre-requisito</span>
            <span className="legend-item"><i className="legend-line corequisite" />Correquisito</span>
          </div>
        </div>
        <MobileBoard
          mapData={mapData}
          actionLoadingId={actionLoadingId}
          onToggleSubject={onToggleSubject}
          semesters={semesters}
        />
        <div className="board-scroll">
          <div className="board-stage" style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}>
            <div
              key={mapData.course.id}
              className="board-canvas"
              style={{
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                transform: `scale(${boardScale})`,
                transformOrigin: 'top left',
              }}
            >
              {semesters.map((semester, index) => (
                <div
                  key={semester}
                  className="board-column-backdrop"
                  style={{
                    left: `${boardMetrics.labelColumnWidth + (index * boardMetrics.columnWidth) + 12}px`,
                    top: `${boardMetrics.headerHeight}px`,
                    width: `${boardMetrics.columnWidth - 24}px`,
                    height: `${layout.height - boardMetrics.headerHeight - 6}px`,
                  }}
                />
              ))}
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
                {edges.map((edge) => (
                  <path
                    key={edge.id}
                    d={getBoardConnectorPath(edge)}
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
        </div>
      </section>
    </div>
  );
}

export default memo(BoardPage);
