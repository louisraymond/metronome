import assert from 'node:assert/strict';

const SAMPLE_PLAN = {
  id: 'bud-powell-basics',
  title: 'Bud Powell Dominant Cycle Warmup',
  description: 'Dominant seventh cycle drill with speed increments.',
  exercises: [
    {
      type: 'midi',
      label: 'Dominant 7ths Cycle (3-7-10 voicings)',
      notes: 'Focus on precision at 200bpm, then step up.',
      section: 'fundamentals',
      durationMinutes: 6,
      tempo: {
        start: 160,
        target: 200,
        increment: 5,
        loopMode: 'bars',
        stepBars: 4,
        fixed: false,
      },
      midiReference: {
        kind: 'builtin',
        id: 'type-ab-voicings',
      },
    },
    {
      type: 'note',
      label: 'Dominant Cycle Hands Together',
      notes: 'Repeat cycle with both hands; rest 30 seconds between loops.',
      section: 'outOfContext',
      durationMinutes: 8,
      tempo: {
        start: 120,
        target: 140,
        increment: 4,
        loopMode: 'time',
        stepDurationSec: 120,
        fixed: false,
      },
    },
  ],
};

const mockFetchFactory = (records) => {
  return (url) => {
    if (!(url in records)) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    const body = records[url];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
};

test('parsePlan validates structure and defaults', async () => {
  const { parsePlan } = await import('../app/practicePlans.js');
  const plan = parsePlan(SAMPLE_PLAN);
  assert.equal(plan.exercises.length, 2);
  const [first, second] = plan.exercises;
  assert.equal(first.type, 'midi');
  assert.equal(first.tempo.loopMode, 'bars');
  assert.equal(first.midiReference.id, 'type-ab-voicings');
  assert.equal(first.section, 'fundamentals');
  assert.equal(first.durationMinutes, 6);
  assert.equal(first.tempo.fixed, false);
  assert.equal(first.tempo.fixedBpm, null);
  assert.equal(second.type, 'note');
  assert.equal(second.midiReference, null);
  assert.equal(second.tempo.loopMode, 'time');
  assert.equal(second.section, 'outOfContext');
  assert.equal(second.durationMinutes, 8);
  assert.equal(second.tempo.fixed, false);
});

test('loadPlans fetches manifest and plans', async () => {
  const manifest = [{ id: 'bud', title: 'Bud Powell', file: 'bud.json' }];
  const mockFetch = mockFetchFactory({
    './assets/plans/index.json': manifest,
    './assets/plans/bud.json': SAMPLE_PLAN,
  });
  const { loadPlans } = await import('../app/practicePlans.js');
  const plans = await loadPlans({ fetch: mockFetch });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, 'bud');
  assert.equal(plans[0].plan.title, SAMPLE_PLAN.title);
});

test('serializePlan emits stable JSON', async () => {
  const { parsePlan, serializePlan } = await import('../app/practicePlans.js');
  const plan = parsePlan(SAMPLE_PLAN);
  const json = serializePlan(plan);
  const plain = JSON.parse(json);
  assert.equal(plain.title, SAMPLE_PLAN.title);
  assert.equal(plain.exercises.length, SAMPLE_PLAN.exercises.length);
  assert.equal(plain.exercises[0].section, 'fundamentals');
  assert.equal(plain.exercises[0].durationMinutes, 6);
  assert.strictEqual(plain.exercises[0].tempo.fixed, false);
});

test('parsePlan falls back to fundamentals section and default duration when invalid', async () => {
  const { parsePlan } = await import('../app/practicePlans.js');
  const sloppy = {
    title: 'Loose Plan',
    exercises: [
      {
        type: 'note',
        label: 'Wander',
        section: 'made-up-section',
        tempo: { start: 90, mode: 'fixed', fixedBpm: 95 },
      },
    ],
  };
  const plan = parsePlan(sloppy);
  assert.equal(plan.exercises[0].section, 'fundamentals');
  assert.equal(plan.exercises[0].durationMinutes, 5);
  assert.equal(plan.exercises[0].tempo.fixed, true);
  assert.equal(plan.exercises[0].tempo.fixedBpm, 95);
});

test('custom plans persist via local storage helpers', async () => {
  const store = {};
  const mockStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = mockStorage;
  try {
    const {
      saveUserPlan,
      loadUserPlans,
      deleteUserPlan,
    } = await import('../app/practicePlans.js');

    const saved = saveUserPlan({
      title: 'Custom Plan',
      description: 'Local draft',
      exercises: [
        {
          type: 'note',
          label: 'Scale Drill',
          section: 'fundamentals',
          durationMinutes: 5,
          tempo: { start: 110, target: 126, increment: 4 },
        },
      ],
    });

    const reloaded = loadUserPlans();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].title, 'Custom Plan');
    assert.equal(reloaded[0].exercises[0].tempo.fixed, false);

    deleteUserPlan(saved.id);
    const afterDelete = loadUserPlans();
    assert.equal(afterDelete.length, 0);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
