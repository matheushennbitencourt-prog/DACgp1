const curriculums = require('../data/curriculums.cjs');

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

function createDepthCalculator(childrenMap) {
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

  return { depthMap: memo, getDepth };
}

function getCriticalPath(subjects, childrenMap) {
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const { depthMap, getDepth } = createDepthCalculator(childrenMap);
  const roots = subjects.filter((subject) => subject.prerequisites.length === 0);

  subjectMap.forEach((_, subjectId) => {
    getDepth(subjectId);
  });

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

function collectDependentSubjects(subjectId, childrenMap, cache, visited = new Set()) {
  if (cache.has(subjectId)) {
    cache.get(subjectId).forEach((dependentId) => visited.add(dependentId));
    return visited;
  }

  const resolved = new Set();
  const directChildren = childrenMap.get(subjectId) || [];

  directChildren.forEach((childId) => {
    if (!resolved.has(childId)) {
      resolved.add(childId);
      collectDependentSubjects(childId, childrenMap, cache, resolved);
    }
  });

  cache.set(subjectId, resolved);
  resolved.forEach((dependentId) => visited.add(dependentId));
  return visited;
}

function createCourseSnapshot(curriculum) {
  const subjectMap = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const childrenMap = buildChildrenMap(curriculum.subjects);
  const dependentMap = new Map();

  curriculum.subjects.forEach((subject) => {
    dependentMap.set(
      subject.id,
      Array.from(collectDependentSubjects(subject.id, childrenMap, dependentMap)),
    );
  });

  return {
    ...curriculum,
    summary: {
      id: curriculum.id,
      code: curriculum.code,
      name: curriculum.name,
      trailLabels: curriculum.trailLabels,
      totalSubjects: curriculum.subjects.length,
    },
    subjectMap,
    childrenMap,
    dependentMap,
    criticalPathIds: getCriticalPath(curriculum.subjects, childrenMap),
  };
}

function mergeCurriculumSources(importedCurriculums = []) {
  const merged = { ...curriculums };

  importedCurriculums.forEach((curriculum) => {
    merged[curriculum.id] = curriculum;
  });

  return merged;
}

function createCurriculumCatalog(source = curriculums) {
  const courses = new Map(
    Object.values(source).map((curriculum) => [curriculum.id, createCourseSnapshot(curriculum)]),
  );

  function getCourse(courseId) {
    return courseId ? courses.get(courseId) || null : null;
  }

  function getSelectedCourse(user, requestedCourseId) {
    return getCourse(requestedCourseId) || getCourse(user.courseId);
  }

  function getSummaryList() {
    return Array.from(courses.values(), (course) => course.summary);
  }

  return {
    getCourse,
    getSelectedCourse,
    getSummaryList,
  };
}

module.exports = {
  createCurriculumCatalog,
  mergeCurriculumSources,
};
