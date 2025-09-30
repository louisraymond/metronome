import assert from 'node:assert/strict';

const SECTIONS = ['fundamentals', 'outOfContext', 'tunes', 'interactingWithHistory'];

const buildExercise = (overrides = {}) => ({
  id: overrides.id || `ex-${Math.random().toString(36).slice(2, 8)}`,
  type: overrides.type || 'note',
  label: overrides.label || 'Exercise',
  notes: overrides.notes || '',
  section: overrides.section || 'fundamentals',
  durationMinutes: overrides.durationMinutes ?? 5,
  tempo: overrides.tempo || { start: 90, target: 100, increment: 2, loopMode: 'bars', stepBars: 4 },
  midiReference: overrides.midiReference ?? null,
});

const buildPlan = () => ({
  id: 'plan-1',
  title: 'Test Plan',
  exercises: [
    buildExercise({ id: 'f-1', section: 'fundamentals', durationMinutes: 6 }),
    buildExercise({ id: 'o-1', section: 'outOfContext', durationMinutes: 4 }),
    buildExercise({ id: 't-1', section: 'tunes', durationMinutes: 9 }),
  ],
});

test('practice queue applies first exercise on start and reports section summaries', async () => {
  const { createPracticeQueue } = await import('../app/practiceQueue.js');
  const applied = [];
  const queue = createPracticeQueue({
    onConfigureExercise: (exercise) => applied.push(exercise.id),
  });
  const plan = buildPlan();
  queue.loadPlan(plan);
  const progress = queue.getProgress();
  assert.equal(progress.active.exercise.id, 'f-1');
  assert.equal(progress.sections.fundamentals.totalMinutes, 6);
  assert.equal(progress.sections.fundamentals.completedMinutes, 0);
  assert.equal(progress.totalMinutes, 19);
  assert.equal(applied.length, 1);
  assert.equal(applied[0], 'f-1');
  SECTIONS.forEach((key) => {
    assert.ok(progress.sections[key]);
  });
});

test('practice queue completion advances to next exercise and updates minutes', async () => {
  const { createPracticeQueue } = await import('../app/practiceQueue.js');
  const applied = [];
  const queue = createPracticeQueue({
    onConfigureExercise: (exercise) => applied.push(exercise.id),
  });
  const plan = buildPlan();
  queue.loadPlan(plan);
  queue.completeActive();
  let progress = queue.getProgress();
  assert.equal(progress.completedExercises, 1);
  assert.equal(progress.sections.fundamentals.completedMinutes, 6);
  assert.equal(progress.sections.outOfContext.completedMinutes, 0);
  assert.equal(progress.active.exercise.id, 'o-1');
  queue.skipActive();
  progress = queue.getProgress();
  assert.equal(progress.completedExercises, 2);
  assert.equal(progress.skippedExercises, 1);
  assert.equal(progress.sections.outOfContext.completedMinutes, 4);
  assert.equal(progress.active.exercise.id, 't-1');
  assert.deepEqual(applied, ['f-1', 'o-1', 't-1']);
});

test('practice queue emits completion callback when final exercise finishes', async () => {
  const { createPracticeQueue } = await import('../app/practiceQueue.js');
  let finishCalled = 0;
  const queue = createPracticeQueue({
    onConfigureExercise: () => {},
    onPlanComplete: () => {
      finishCalled += 1;
    },
  });
  const plan = buildPlan();
  queue.loadPlan(plan);
  queue.completeActive();
  queue.completeActive();
  queue.completeActive();
  assert.equal(finishCalled, 1);
  const progress = queue.getProgress();
  assert.equal(progress.active, null);
  assert.equal(progress.completedExercises, 3);
  assert.equal(progress.remainingMinutes, 0);
});
