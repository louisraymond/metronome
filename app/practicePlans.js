const DEFAULT_TEMPO = {
  start: 120,
  target: 120,
  increment: 4,
  loopMode: 'bars',
  stepBars: 4,
  stepDurationSec: null,
};

const normaliseTempo = (tempo = {}) => {
  const loopMode = tempo.loopMode === 'time' ? 'time' : 'bars';
  return {
    start: Number.isFinite(tempo.start) ? tempo.start : DEFAULT_TEMPO.start,
    target: Number.isFinite(tempo.target) ? tempo.target : DEFAULT_TEMPO.target,
    increment: Number.isFinite(tempo.increment) ? tempo.increment : DEFAULT_TEMPO.increment,
    loopMode,
    stepBars: loopMode === 'bars' ? Math.max(1, tempo.stepBars ?? DEFAULT_TEMPO.stepBars) : null,
    stepDurationSec: loopMode === 'time' ? Math.max(10, tempo.stepDurationSec ?? 60) : null,
  };
};

const normaliseMidiReference = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'string') return { kind: 'builtin', id: ref };
  if (ref.kind === 'builtin' && ref.id) return { kind: 'builtin', id: ref.id };
  if (ref.kind === 'custom' && ref.name) return { kind: 'custom', name: ref.name, url: ref.url ?? null };
  return null;
};

export const parsePlan = (raw) => {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid practice plan payload');
  const plan = {
    id: raw.id || crypto?.randomUUID?.() || `plan-${Date.now()}`,
    title: raw.title || 'Untitled Plan',
    description: raw.description || '',
    exercises: [],
  };

  const list = Array.isArray(raw.exercises) ? raw.exercises : [];
  plan.exercises = list.map((exercise, index) => {
    if (!exercise || typeof exercise !== 'object') throw new Error(`Exercise ${index + 1} is invalid`);
    const type = exercise.type === 'note' ? 'note' : 'midi';
    const tempo = normaliseTempo(exercise.tempo);
    return {
      id: exercise.id || `${plan.id}-ex${index + 1}`,
      type,
      label: exercise.label || `Exercise ${index + 1}`,
      notes: exercise.notes || '',
      tempo,
      midiReference: type === 'midi' ? normaliseMidiReference(exercise.midiReference) : null,
    };
  });

  return plan;
};

export const serializePlan = (plan) => {
  if (!plan) return 'null';
  const plain = {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    exercises: plan.exercises.map((ex) => ({
      id: ex.id,
      type: ex.type,
      label: ex.label,
      notes: ex.notes,
      tempo: {
        start: ex.tempo.start,
        target: ex.tempo.target,
        increment: ex.tempo.increment,
        loopMode: ex.tempo.loopMode,
        stepBars: ex.tempo.stepBars,
        stepDurationSec: ex.tempo.stepDurationSec,
      },
      midiReference: ex.midiReference,
    })),
  };
  return JSON.stringify(plain, null, 2);
};

export const loadPlans = async ({ fetch: customFetch } = {}) => {
  const fetchImpl = customFetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) throw new Error('fetch is not available');

  const manifestResp = await fetchImpl('./assets/plans/index.json');
  if (!manifestResp.ok) throw new Error(`Failed to load plans manifest (${manifestResp.status})`);
  const manifest = await manifestResp.json();
  if (!Array.isArray(manifest)) return [];

  const plans = [];
  for (const entry of manifest) {
    if (!entry || !entry.file) continue;
    const url = `./assets/plans/${entry.file}`;
    const resp = await fetchImpl(url);
    if (!resp.ok) {
      console.warn(`Failed to load plan ${entry.id || url}: HTTP ${resp.status}`);
      continue;
    }
    const json = await resp.json();
    const plan = parsePlan(json);
    plans.push({
      id: entry.id || plan.id,
      title: entry.title || plan.title,
      description: entry.description || plan.description,
      plan,
    });
  }
  return plans;
};

export const exportCurrentPlan = (plan) => {
  const json = serializePlan(plan);
  if (typeof document === 'undefined') return json;
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const filename = `${plan?.title?.replace(/\s+/g, '-') || 'practice-plan'}.json`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return json;
};
