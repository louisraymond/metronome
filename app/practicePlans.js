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
  const start = Number.isFinite(tempo.start) ? tempo.start : DEFAULT_TEMPO.start;
  const target = Number.isFinite(tempo.target) ? tempo.target : start;
  const increment = Number.isFinite(tempo.increment) ? Math.max(0, tempo.increment) : DEFAULT_TEMPO.increment;
  const fixedFlag = tempo.mode === 'fixed' || tempo.fixed === true;
  const fixedBpmRaw = Number.isFinite(tempo.fixedBpm) ? tempo.fixedBpm : Number.isFinite(tempo.bpm) ? tempo.bpm : null;
  const fixedBpm = fixedFlag
    ? (Number.isFinite(fixedBpmRaw) ? fixedBpmRaw : start)
    : null;
  return {
    start,
    target,
    increment,
    loopMode,
    stepBars: loopMode === 'bars' ? Math.max(1, tempo.stepBars ?? DEFAULT_TEMPO.stepBars) : null,
    stepDurationSec: loopMode === 'time' ? Math.max(10, tempo.stepDurationSec ?? 60) : null,
    fixed: fixedFlag,
    fixedBpm,
  };
};

const normaliseMidiReference = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'string') return { kind: 'builtin', id: ref };
  if (ref.kind === 'builtin' && ref.id) return { kind: 'builtin', id: ref.id };
  if (ref.kind === 'custom' && ref.name) return { kind: 'custom', name: ref.name, url: ref.url ?? null };
  return null;
};

const SECTION_ORDER = ['fundamentals', 'outOfContext', 'tunes', 'interactingWithHistory'];

const slugifySection = (value) => {
  if (!value) return SECTION_ORDER[0];
  const lowered = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!lowered) return SECTION_ORDER[0];
  if (lowered.startsWith('fundamental')) return 'fundamentals';
  if (lowered.startsWith('outofcontext')) return 'outOfContext';
  if (lowered.startsWith('tune')) return 'tunes';
  if (lowered.startsWith('interactingwithhistory') || lowered.startsWith('history')) {
    return 'interactingWithHistory';
  }
  return SECTION_ORDER[0];
};

const normaliseDuration = (value) => {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.round(value));
};

const makePlanId = (fallbackPrefix = 'plan') => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${fallbackPrefix}-${Math.random().toString(16).slice(2)}`;
};

export const parsePlan = (raw) => {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid practice plan payload');
  const plan = {
    id: raw.id || makePlanId(),
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
      section: slugifySection(exercise.section),
      durationMinutes: normaliseDuration(exercise.durationMinutes),
      tempo,
      midiReference: type === 'midi' ? normaliseMidiReference(exercise.midiReference) : null,
    };
  });

  plan.sectionOrder = SECTION_ORDER.slice();

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
      section: ex.section,
      durationMinutes: ex.durationMinutes,
      tempo: {
        start: ex.tempo.start,
        target: ex.tempo.target,
        increment: ex.tempo.increment,
        loopMode: ex.tempo.loopMode,
        stepBars: ex.tempo.stepBars,
        stepDurationSec: ex.tempo.stepDurationSec,
        fixed: !!ex.tempo.fixed,
        fixedBpm: ex.tempo.fixedBpm ?? null,
      },
      midiReference: ex.midiReference,
    })),
  };
  return JSON.stringify(plain, null, 2);
};

export const SECTION_LABELS = {
  fundamentals: 'Fundamentals',
  outOfContext: 'Out of Context',
  tunes: 'Tunes',
  interactingWithHistory: 'Interacting With History',
};

export const getSectionOrder = () => SECTION_ORDER.slice();

const STORAGE_KEY = 'mt_practice_plans_custom';

const getStorage = () => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch (_) {
    return undefined;
  }
};

const readCustomPlans = () => {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((plan) => {
        try {
          return parsePlan(plan);
        } catch (err) {
          console.warn('Skipping invalid custom plan:', err);
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn('Failed to read custom practice plans:', err);
    return [];
  }
};

const writeCustomPlans = (plans) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload = plans.map((plan) => JSON.parse(serializePlan(plan)));
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to persist custom practice plans:', err);
  }
};

const ensurePlanId = (plan) => {
  if (plan.id && !plan.id.startsWith('temp-')) return plan;
  return { ...plan, id: makePlanId('plan') };
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
      source: 'builtin',
    });
  }
  const customPlans = readCustomPlans();
  customPlans.forEach((plan) => {
    plans.push({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      plan,
      source: 'custom',
    });
  });
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

export const loadUserPlans = () => readCustomPlans();

export const saveUserPlan = (plan, { overwriteId } = {}) => {
  const current = readCustomPlans();
  const parsed = parsePlan(plan);
  const normalised = ensurePlanId(parsed);
  const idToUse = overwriteId || normalised.id;
  const updated = current.filter((item) => item.id !== idToUse);
  updated.push({ ...normalised, id: idToUse });
  writeCustomPlans(updated);
  return { ...normalised, id: idToUse };
};

export const deleteUserPlan = (id) => {
  if (!id) return;
  const current = readCustomPlans();
  const filtered = current.filter((plan) => plan.id !== id);
  if (filtered.length === current.length) return;
  writeCustomPlans(filtered);
};
