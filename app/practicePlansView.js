import { serializePlan } from './practicePlans.js';

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function formatLoopLabel(tempo = {}) {
  if (!tempo) return null;
  if (tempo.loopMode === 'time' && isFiniteNumber(tempo.stepDurationSec)) {
    const total = Math.max(0, Math.round(tempo.stepDurationSec));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins > 0) return `every ${mins}m ${secs.toString().padStart(2, '0')}s`;
    return `every ${secs}s`;
  }
  if (isFiniteNumber(tempo.stepBars)) {
    const bars = Math.max(1, Math.round(tempo.stepBars));
    const noun = bars === 1 ? 'bar' : 'bars';
    return `every ${bars} ${noun}`;
  }
  return null;
}

function formatTempoSummary(tempo = {}) {
  const parts = [];
  const start = isFiniteNumber(tempo.start) ? tempo.start : null;
  const target = isFiniteNumber(tempo.target) ? tempo.target : null;
  const increment = isFiniteNumber(tempo.increment) ? tempo.increment : null;

  if (start !== null && target !== null && start !== target) {
    parts.push(`${start}→${target} BPM`);
  } else if (target !== null) {
    parts.push(`${target} BPM`);
  } else if (start !== null) {
    parts.push(`${start} BPM`);
  }

  if (increment !== null && increment > 0) {
    parts.push(`+${increment}`);
  }

  const loopLabel = formatLoopLabel(tempo);
  if (loopLabel) parts.push(loopLabel);

  return parts.length ? parts.join(' · ') : 'Tempo details unavailable';
}

function formatMidiReference(ref, lookup) {
  if (!ref) return null;
  if (ref.kind === 'builtin' && ref.id) {
    const label = lookup?.get(ref.id);
    return `Built-in track: ${label || ref.id}`;
  }
  if (ref.kind === 'custom') {
    return `Custom track: ${ref.name || 'Uploaded file'}`;
  }
  return null;
}

export function createPracticePlansView(options = {}) {
  const {
    root,
    document = globalThis.document,
    onQueuePlan,
    onExportPlan,
    onSelectPlan,
    midiLibrary = [],
  } = options;

  if (!root) {
    throw new Error('createPracticePlansView requires a root element');
  }

  const doc = document;
  const midiLookup = new Map(
    Array.isArray(midiLibrary)
      ? midiLibrary
          .filter((item) => item && item.id)
          .map((item) => [item.id, item.label || item.id])
      : [],
  );
  const state = {
    plans: [],
    planMap: new Map(),
    selectedId: null,
  };

  let listButtons = [];
  let selectedEntry = null;

  root.innerHTML = '';
  root.classList.add('practice-plans-view');

  const layout = doc.createElement('div');
  layout.className = 'plans-layout';

  const listSection = doc.createElement('section');
  listSection.className = 'card plans-column plans-list';

  const listTitle = doc.createElement('h3');
  listTitle.textContent = 'Available Plans';
  listSection.appendChild(listTitle);

  const planList = doc.createElement('ul');
  planList.className = 'plan-list';
  listSection.appendChild(planList);

  const detailSection = doc.createElement('section');
  detailSection.className = 'card plans-column plan-detail';

  const detailHeader = doc.createElement('div');
  detailHeader.className = 'plan-detail-header';

  const detailTitle = doc.createElement('h2');
  detailTitle.className = 'plan-detail-title';
  detailHeader.appendChild(detailTitle);

  const detailDescription = doc.createElement('p');
  detailDescription.className = 'plan-detail-description';
  detailHeader.appendChild(detailDescription);

  detailSection.appendChild(detailHeader);

  const exerciseList = doc.createElement('ol');
  exerciseList.className = 'exercise-list';
  detailSection.appendChild(exerciseList);

  const controls = doc.createElement('div');
  controls.className = 'plan-controls';

  const queueButton = doc.createElement('button');
  queueButton.type = 'button';
  queueButton.className = 'btn';
  queueButton.textContent = 'Load into Metronome';
  queueButton.disabled = true;

  queueButton.addEventListener('click', (event) => {
    event?.preventDefault?.();
    if (!selectedEntry) return;
    onQueuePlan?.(selectedEntry.plan);
  });

  const exportButton = doc.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn ghost';
  exportButton.textContent = 'Export JSON';
  exportButton.disabled = true;

  exportButton.addEventListener('click', (event) => {
    event?.preventDefault?.();
    exportActivePlan();
  });

  controls.appendChild(queueButton);
  controls.appendChild(exportButton);
  detailSection.appendChild(controls);

  layout.appendChild(listSection);
  layout.appendChild(detailSection);
  root.appendChild(layout);

  const emptyListNotice = doc.createElement('li');
  emptyListNotice.className = 'empty-state';
  emptyListNotice.textContent = 'No practice plans available yet.';

  const emptyExercises = doc.createElement('li');
  emptyExercises.className = 'empty-state';
  emptyExercises.textContent = 'This plan has no exercises.';

  function getEntry(id) {
    if (!id) return null;
    return state.planMap.get(id) || null;
  }

  function renderList() {
    planList.replaceChildren();
    listButtons = [];

    if (state.plans.length === 0) {
      planList.appendChild(emptyListNotice);
      return;
    }

    state.plans.forEach((entry) => {
      const item = doc.createElement('li');
      item.className = 'plan-list-item';

      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'plan-list-button';
      button.textContent = entry.title || entry.plan?.title || 'Untitled Plan';
      button.dataset.planId = entry.id;
      button.classList.toggle('active', entry.id === state.selectedId);
      button.addEventListener('click', (event) => {
        event?.preventDefault?.();
        selectPlan(entry.id);
      });

      item.appendChild(button);
      planList.appendChild(item);
      listButtons.push(button);
    });
  }

  function renderExercises(entry) {
    exerciseList.replaceChildren();

    const exercises = Array.isArray(entry?.plan?.exercises)
      ? entry.plan.exercises
      : [];

    if (exercises.length === 0) {
      exerciseList.appendChild(emptyExercises);
      return;
    }

    exercises.forEach((exercise, index) => {
      const item = doc.createElement('li');
      item.className = 'exercise-item';
      item.dataset.exerciseId = exercise.id || `exercise-${index + 1}`;

      const title = doc.createElement('div');
      title.className = 'exercise-title';
      title.textContent = exercise.label || `Exercise ${index + 1}`;
      item.appendChild(title);

      const metaParts = [];
      metaParts.push(exercise.type === 'midi' ? 'MIDI' : 'Notes');
      metaParts.push(formatTempoSummary(exercise.tempo));
      const midiLabel = formatMidiReference(exercise.midiReference, midiLookup);
      if (midiLabel) metaParts.push(midiLabel);

      const meta = doc.createElement('div');
      meta.className = 'exercise-meta';
      meta.textContent = metaParts.join(' · ');
      item.appendChild(meta);

      if (exercise.notes) {
        const notes = doc.createElement('div');
        notes.className = 'exercise-notes';
        notes.textContent = exercise.notes;
        item.appendChild(notes);
      }

      exerciseList.appendChild(item);
    });
  }

  function renderDetail() {
    selectedEntry = getEntry(state.selectedId);

    if (!selectedEntry) {
      detailTitle.textContent = 'Select a plan to inspect its exercises';
      detailDescription.textContent = 'Choose a plan from the left to view tempo targets and notes.';
      renderExercises(null);
      queueButton.disabled = true;
      exportButton.disabled = true;
      return;
    }

    const plan = selectedEntry.plan;
    detailTitle.textContent = selectedEntry.title || plan?.title || 'Practice Plan';
    detailDescription.textContent = selectedEntry.description || plan?.description || '';

    renderExercises(selectedEntry);

    queueButton.disabled = false;
    exportButton.disabled = false;
  }

  function selectPlan(id) {
    const entry = getEntry(id);
    if (!entry) return null;
    const currentId = state.selectedId;
    state.selectedId = id;
    renderList();
    renderDetail();
    if (currentId !== id) {
      onSelectPlan?.(entry.plan);
    }
    return entry.plan;
  }

  function setPlans(plans = []) {
    state.plans = Array.isArray(plans)
      ? plans.map((entry) => ({
        id: entry.id || entry.plan?.id,
        title: entry.title ?? entry.plan?.title ?? 'Untitled Plan',
        description: entry.description ?? entry.plan?.description ?? '',
        plan: entry.plan ?? null,
      })).filter((entry) => entry.id)
      : [];

    state.planMap = new Map(state.plans.map((entry) => [entry.id, entry]));

    if (!state.planMap.has(state.selectedId)) {
      state.selectedId = state.plans[0]?.id ?? null;
    }

    renderList();
    renderDetail();

    const entry = getEntry(state.selectedId);
    if (entry && typeof onSelectPlan === 'function') {
      onSelectPlan(entry.plan);
    }

    return entry?.plan ?? null;
  }

  function getSelectedPlan() {
    return selectedEntry?.plan ?? null;
  }

  function getPlanListItems() {
    return listButtons.slice();
  }

  function getExerciseItems() {
    return Array.from(exerciseList.children);
  }

  function exportActivePlan() {
    const entry = getEntry(state.selectedId);
    if (!entry?.plan) return null;
    const json = serializePlan(entry.plan);
    onExportPlan?.(entry.plan, json);
    return json;
  }

  return {
    setPlans,
    selectPlan,
    getSelectedPlan,
    getPlanListItems,
    getExerciseItems,
    exportActivePlan,
  };
}
