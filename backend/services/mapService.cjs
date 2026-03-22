const statusOrder = {
  completed: 0,
  available: 1,
  locked: 2,
};

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

function buildMapPayload(user, selectedCourseId, curriculumCatalog) {
  const curriculum = curriculumCatalog.getSelectedCourse(user, selectedCourseId);
  const completedIds = new Set(user.progress?.[curriculum.id] || []);
  let completedCount = 0;
  let availableCount = 0;

  const subjects = curriculum.subjects
    .map((subject) => {
      const allPrerequisitesDone = subject.prerequisites.every((prerequisiteId) => completedIds.has(prerequisiteId));
      const status = completedIds.has(subject.id)
        ? 'completed'
        : allPrerequisitesDone
          ? 'available'
          : 'locked';

      if (status === 'completed') {
        completedCount += 1;
      } else if (status === 'available') {
        availableCount += 1;
      }

      return {
        ...subject,
        status,
        isCritical: curriculum.criticalPathIds.has(subject.id),
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
  const completionRate = totalSubjects === 0 ? 0 : Math.round((completedCount / totalSubjects) * 100);
  const pendingIds = new Set(subjects.filter((subject) => subject.status !== 'completed').map((subject) => subject.id));
  const remainingCriticalSemesters = pendingIds.size === 0
    ? 0
    : Math.max(...Array.from(pendingIds, (subjectId) => (
      countRemainingChain(subjectId, pendingIds, curriculum.subjectMap)
    )));

  return {
    course: {
      id: curriculum.id,
      code: curriculum.code,
      baseCode: curriculum.baseCode,
      name: curriculum.name,
      catalogName: curriculum.catalogName,
      catalogKey: curriculum.catalogKey,
      academicYear: curriculum.academicYear,
      versionLabel: curriculum.versionLabel,
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

module.exports = {
  buildMapPayload,
};
