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
      tempo: {
        start: 160,
        target: 200,
        increment: 5,
        loopMode: 'bars',
        stepBars: 4,
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
      tempo: {
        start: 120,
        target: 140,
        increment: 4,
        loopMode: 'time',
        stepDurationSec: 120,
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
  assert.equal(second.type, 'note');
  assert.equal(second.midiReference, null);
  assert.equal(second.tempo.loopMode, 'time');
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
});
