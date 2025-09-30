import { getSectionOrder } from './practicePlans.js';

const STATUS_PENDING = 'pending';
const STATUS_COMPLETE = 'complete';
const STATUS_SKIPPED = 'skipped';

const clampMinutes = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

export function createPracticeQueue({ onConfigureExercise, onPlanComplete } = {}) {
  const sectionOrder = getSectionOrder();
  const state = {
    plan: null,
    entries: [],
    activeIndex: null,
    completedExercises: 0,
    skippedExercises: 0,
    completedMinutes: 0,
    sectionSummaries: new Map(),
  };

  const initialiseSectionSummaries = (plan) => {
    const summaries = new Map();
    sectionOrder.forEach((section) => {
      summaries.set(section, {
        totalMinutes: 0,
        completedMinutes: 0,
        totalExercises: 0,
        completedExercises: 0,
        skippedExercises: 0,
      });
    });
    if (plan?.exercises?.length) {
      plan.exercises.forEach((exercise) => {
        const section = exercise.section || sectionOrder[0];
        const summary = summaries.get(section);
        if (summary) {
          summary.totalExercises += 1;
          summary.totalMinutes += clampMinutes(exercise.durationMinutes);
        }
      });
    }
    state.sectionSummaries = summaries;
  };

  const configureCurrentExercise = () => {
    const entry = state.entries[state.activeIndex];
    if (!entry) return;
    try {
      onConfigureExercise?.(entry.exercise, {
        index: state.activeIndex,
        total: state.entries.length,
      });
    } catch (err) {
      console.warn('practiceQueue: onConfigureExercise failed', err);
    }
  };

  const settleCompletedExercise = (entry, status) => {
    if (!entry) return;
    const { section } = entry.exercise;
    const summary = state.sectionSummaries.get(section) || state.sectionSummaries.get(sectionOrder[0]);
    const minutes = clampMinutes(entry.exercise.durationMinutes);
    if (status === STATUS_COMPLETE) {
      state.completedExercises += 1;
      state.completedMinutes += minutes;
      if (summary) {
        summary.completedExercises += 1;
        summary.completedMinutes += minutes;
      }
    } else if (status === STATUS_SKIPPED) {
      state.completedExercises += 1;
      state.skippedExercises += 1;
      state.completedMinutes += minutes;
      if (summary) {
        summary.completedExercises += 1;
        summary.completedMinutes += minutes;
        summary.skippedExercises += 1;
      }
    }
  };

  const findNextIndex = (startIndex = 0) => {
    for (let i = startIndex; i < state.entries.length; i += 1) {
      if (state.entries[i].status === STATUS_PENDING) {
        return i;
      }
    }
    return null;
  };

  const finishPlanIfNeeded = () => {
    if (state.activeIndex === null) {
      try {
        onPlanComplete?.(state.plan);
      } catch (err) {
        console.warn('practiceQueue: onPlanComplete failed', err);
      }
    }
  };

  const setActiveIndex = (index) => {
    state.activeIndex = index;
    if (index !== null) {
      configureCurrentExercise();
    } else {
      finishPlanIfNeeded();
    }
  };

  return {
    loadPlan(plan) {
      state.plan = plan || null;
      state.entries = Array.isArray(plan?.exercises)
        ? plan.exercises.map((exercise) => ({ exercise, status: STATUS_PENDING }))
        : [];
      state.completedExercises = 0;
      state.skippedExercises = 0;
      state.completedMinutes = 0;
      initialiseSectionSummaries(plan);
      const nextIndex = state.entries.length ? 0 : null;
      setActiveIndex(nextIndex);
      return this.getProgress();
    },
    reset() {
      state.plan = null;
      state.entries = [];
      state.completedExercises = 0;
      state.skippedExercises = 0;
      state.completedMinutes = 0;
      initialiseSectionSummaries(null);
      state.activeIndex = null;
    },
    getProgress() {
      const totalMinutes = Array.from(state.sectionSummaries.values())
        .reduce((sum, summary) => sum + summary.totalMinutes, 0);
      const remainingMinutes = Math.max(0, totalMinutes - state.completedMinutes);
      const sections = {};
      state.sectionSummaries.forEach((summary, key) => {
        sections[key] = { ...summary };
      });
      const entries = state.entries.map((entry, index) => ({
        exercise: entry.exercise,
        status: entry.status,
        index,
      }));
      const active = state.activeIndex === null
        ? null
        : { ...entries[state.activeIndex] };
      return {
        plan: state.plan,
        activeIndex: state.activeIndex,
        active,
        entries,
        totalExercises: state.entries.length,
        completedExercises: state.completedExercises,
        skippedExercises: state.skippedExercises,
        totalMinutes,
        completedMinutes: state.completedMinutes,
        remainingMinutes,
        sections,
      };
    },
    completeActive() {
      const entry = state.entries[state.activeIndex];
      if (!entry) return this.getProgress();
      entry.status = STATUS_COMPLETE;
      settleCompletedExercise(entry, STATUS_COMPLETE);
      const nextIndex = findNextIndex(state.activeIndex + 1);
      setActiveIndex(nextIndex);
      return this.getProgress();
    },
    skipActive() {
      const entry = state.entries[state.activeIndex];
      if (!entry) return this.getProgress();
      entry.status = STATUS_SKIPPED;
      settleCompletedExercise(entry, STATUS_SKIPPED);
      const nextIndex = findNextIndex(state.activeIndex + 1);
      setActiveIndex(nextIndex);
      return this.getProgress();
    },
    goTo(index) {
      if (!Number.isInteger(index) || index < 0 || index >= state.entries.length) {
        return this.getProgress();
      }
      if (state.entries[index].status !== STATUS_PENDING) {
        return this.getProgress();
      }
      state.activeIndex = index;
      configureCurrentExercise();
      return this.getProgress();
    },
    hasPlan() {
      return !!state.plan;
    },
  };
}
