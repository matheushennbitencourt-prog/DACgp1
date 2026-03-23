import {
  Fragment,
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getTrailOrder,
  getTrailSlug,
  statusLabels,
  statusOrder,
} from '../app-utils.js';

function sortSubjects(items) {
  return [...items].sort((first, second) => {
    if (statusOrder[first.status] !== statusOrder[second.status]) {
      return statusOrder[first.status] - statusOrder[second.status];
    }

    return first.id.localeCompare(second.id);
  });
}

function buildBoardDesktopModel(mapData) {
  const semesters = [...new Set(mapData.subjects.map((subject) => subject.semester))].sort((a, b) => a - b);
  const trails = getTrailOrder(mapData.subjects, mapData.course.trailLabels);
  const cells = new Map();
  const subjectMap = new Map(mapData.subjects.map((subject) => [subject.id, subject]));
  const edges = [];

  trails.forEach((trail) => {
    semesters.forEach((semester) => {
      const key = `${trail}::${semester}`;
      const items = mapData.subjects.filter((subject) => subject.trail === trail && subject.semester === semester);
      cells.set(key, sortSubjects(items));
    });
  });

  mapData.subjects.forEach((subject) => {
    subject.prerequisites.forEach((prerequisiteId) => {
      if (!subjectMap.has(prerequisiteId)) {
        return;
      }

      edges.push({
        id: `${prerequisiteId}-${subject.id}`,
        fromId: prerequisiteId,
        toId: subject.id,
        type: 'prerequisite',
      });
    });
  });

  return { semesters, trails, cells, edges };
}

function buildDirectConnectorPath(source, target) {
  const sourceRight = source.x + source.width;
  const sourceCenterY = source.y + (source.height / 2);
  const targetLeft = target.x;
  const targetCenterY = target.y + (target.height / 2);
  const horizontalDistance = targetLeft - sourceRight;

  if (horizontalDistance > 56) {
    const lead = Math.max(28, Math.min(88, horizontalDistance * 0.38));

    return `M ${sourceRight} ${sourceCenterY} C ${sourceRight + lead} ${sourceCenterY}, ${targetLeft - lead} ${targetCenterY}, ${targetLeft} ${targetCenterY}`;
  }

  const laneX = sourceRight + Math.max(20, Math.min(36, Math.abs(horizontalDistance) * 0.45));
  const elbow = Math.max(8, Math.min(14, Math.abs(targetCenterY - sourceCenterY) * 0.16));

  return [
    `M ${sourceRight} ${sourceCenterY}`,
    `L ${laneX - elbow} ${sourceCenterY}`,
    `Q ${laneX} ${sourceCenterY} ${laneX} ${sourceCenterY + Math.sign(targetCenterY - sourceCenterY || 1) * elbow}`,
    `L ${laneX} ${targetCenterY - Math.sign(targetCenterY - sourceCenterY || 1) * elbow}`,
    `Q ${laneX} ${targetCenterY} ${laneX + elbow} ${targetCenterY}`,
    `L ${targetLeft} ${targetCenterY}`,
  ].join(' ');
}

function buildJunctionPath(source, junction) {
  const sourceRight = source.x + source.width;
  const sourceCenterY = source.y + (source.height / 2);
  const elbow = Math.max(8, Math.min(14, Math.abs(junction.y - sourceCenterY) * 0.16));

  return [
    `M ${sourceRight} ${sourceCenterY}`,
    `L ${junction.x - elbow} ${sourceCenterY}`,
    `Q ${junction.x} ${sourceCenterY} ${junction.x} ${sourceCenterY + Math.sign(junction.y - sourceCenterY || 1) * elbow}`,
    `L ${junction.x} ${junction.y}`,
  ].join(' ');
}

function buildJunctionToTargetPath(junction, target) {
  const targetLeft = target.x;
  const targetCenterY = target.y + (target.height / 2);

  return `M ${junction.x} ${junction.y} L ${targetLeft} ${targetCenterY}`;
}

function buildConnectorSegments(edges, nodes) {
  const groupedEdges = new Map();

  edges.forEach((edge) => {
    const source = nodes[edge.fromId];
    const target = nodes[edge.toId];

    if (!source || !target) {
      return;
    }

    if (!groupedEdges.has(edge.toId)) {
      groupedEdges.set(edge.toId, []);
    }

    groupedEdges.get(edge.toId).push({
      ...edge,
      source,
      target,
    });
  });

  const segments = [];

  groupedEdges.forEach((group, toId) => {
    const target = nodes[toId];

    if (!target) {
      return;
    }

    if (group.length === 1) {
      const [{ source }] = group;

      segments.push({
        id: `${toId}-single`,
        type: 'prerequisite',
        d: buildDirectConnectorPath(source, target),
      });

      return;
    }

    const sortedGroup = [...group].sort((first, second) => {
      const firstCenter = first.source.y + (first.source.height / 2);
      const secondCenter = second.source.y + (second.source.height / 2);
      return firstCenter - secondCenter;
    });
    const targetLeft = target.x;
    const targetCenterY = target.y + (target.height / 2);
    const nearestSourceRight = Math.max(...sortedGroup.map((item) => item.source.x + item.source.width));
    const availableSpan = Math.max(24, targetLeft - nearestSourceRight);
    const junction = {
      x: targetLeft - Math.max(18, Math.min(availableSpan * 0.34, target.width * 0.22)),
      y: targetCenterY,
    };

    sortedGroup.forEach((edge) => {
      segments.push({
        id: `${edge.id}-branch`,
        type: 'prerequisite',
        d: buildJunctionPath(edge.source, junction),
      });
    });

    segments.push({
      id: `${toId}-trunk`,
      type: 'prerequisite',
      d: buildJunctionToTargetPath(junction, target),
      junction,
    });
  });

  return segments;
}

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

function DesktopBoard({ actionLoadingId, onToggleSubject, semesters, trails, cells, edges }) {
  const shellRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const [geometry, setGeometry] = useState({ width: 0, height: 0, nodes: {} });

  useLayoutEffect(() => {
    const shell = shellRef.current;

    if (!shell) {
      return undefined;
    }

    let frameId = 0;

    const measure = () => {
      frameId = 0;

      const shellRect = shell.getBoundingClientRect();
      const nodes = {};

      nodeRefs.current.forEach((node, subjectId) => {
        const rect = node.getBoundingClientRect();

        nodes[subjectId] = {
          x: rect.left - shellRect.left,
          y: rect.top - shellRect.top,
          width: rect.width,
          height: rect.height,
        };
      });

      setGeometry({
        width: shell.scrollWidth,
        height: shell.scrollHeight,
        nodes,
      });
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);

    if (observer) {
      observer.observe(shell);
      nodeRefs.current.forEach((node) => observer.observe(node));
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      if (observer) {
        observer.disconnect();
      }

      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [semesters, trails, cells, edges]);

  const connectorSegments = useMemo(
    () => buildConnectorSegments(edges, geometry.nodes),
    [edges, geometry.nodes],
  );

  return (
    <div className="board-desktop">
      <div className="board-scroll">
        <div
          ref={shellRef}
          className="board-shell"
          style={{ '--board-semesters': semesters.length }}
        >
          <svg
            className="board-grid"
            viewBox={`0 0 ${Math.max(geometry.width, 1)} ${Math.max(geometry.height, 1)}`}
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            {connectorSegments.map((segment) => (
              <Fragment key={segment.id}>
                <path
                  d={segment.d}
                  className={`board-edge ${segment.type}`}
                />
                {segment.junction ? (
                  <circle
                    cx={segment.junction.x}
                    cy={segment.junction.y}
                    r="4"
                    className="board-junction"
                  />
                ) : null}
              </Fragment>
            ))}
          </svg>

          <div className="board-desktop-grid">
            <div className="board-corner" />
            {semesters.map((semester) => (
              <div key={semester} className="board-semester-head">
                <span>{semester}o semestre</span>
              </div>
            ))}

            {trails.map((trail) => (
              <Fragment key={trail}>
                <div className={`board-trail-head trail-${getTrailSlug(trail)}`}>
                  <span>{trail}</span>
                </div>

                {semesters.map((semester) => {
                  const cellKey = `${trail}::${semester}`;
                  const subjects = cells.get(cellKey) || [];

                  return (
                    <section key={cellKey} className="board-semester-cell">
                      <div className="board-cell-stack">
                        {subjects.map((subject) => (
                          <button
                            key={subject.id}
                            ref={(node) => {
                              if (node) {
                                nodeRefs.current.set(subject.id, node);
                              } else {
                                nodeRefs.current.delete(subject.id);
                              }
                            }}
                            type="button"
                            className={`board-subject-card status-${subject.status} trail-${getTrailSlug(subject.trail)} ${subject.isCritical ? 'is-critical' : ''}`}
                            onClick={() => onToggleSubject(subject)}
                            disabled={actionLoadingId === subject.id || subject.status === 'locked'}
                          >
                            <span className="board-subject-check" aria-hidden="true" />
                            <div className="board-subject-content">
                              <div className="board-subject-topline">
                                <span className="board-subject-trail">{subject.trail}</span>
                                <span className="board-subject-code">{subject.id}</span>
                              </div>
                              <strong>{subject.name}</strong>
                              <p>{statusLabels[subject.status]}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardPage({ mapData, actionLoadingId, onToggleSubject }) {
  const {
    semesters,
    trails,
    cells,
    edges,
  } = useMemo(() => buildBoardDesktopModel(mapData), [mapData]);

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
          </div>
        </div>
        <DesktopBoard
          actionLoadingId={actionLoadingId}
          onToggleSubject={onToggleSubject}
          semesters={semesters}
          trails={trails}
          cells={cells}
          edges={edges}
        />
        <MobileBoard
          mapData={mapData}
          actionLoadingId={actionLoadingId}
          onToggleSubject={onToggleSubject}
          semesters={semesters}
        />
      </section>
    </div>
  );
}

export default memo(BoardPage);
