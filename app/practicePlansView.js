import { serializePlan, SECTION_LABELS, getSectionOrder } from './practicePlans.js';

const formatMinutesLabel = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  return `${minutes} min`;
};

const formatLoopLabel = (tempo = {}) => {
  if (!tempo) return null;
  if (tempo.fixed) return tempo.fixedBpm ? `Fixed ${tempo.fixedBpm} BPM` : 'Fixed tempo';
  if (tempo.loopMode === 'time' && Number.isFinite(tempo.stepDurationSec)) {
    const total = Math.max(0, Math.round(tempo.stepDurationSec));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins > 0) return `every ${mins}m ${secs.toString().padStart(2, '0')}s`;
    return `every ${secs}s`;
  }
  if (Number.isFinite(tempo.stepBars)) {
    const bars = Math.max(1, Math.round(tempo.stepBars));
    const noun = bars === 1 ? 'bar' : 'bars';
    return `every ${bars} ${noun}`;
  }
  return null;
};

const formatTempoSummary = (tempo = {}) => {
  if (tempo.fixed) {
    return formatLoopLabel(tempo) ?? 'Fixed tempo';
  }
  const parts = [];
  if (Number.isFinite(tempo.start) && Number.isFinite(tempo.target) && tempo.start !== tempo.target) {
    parts.push(`${tempo.start}→${tempo.target} BPM`);
  } else if (Number.isFinite(tempo.target)) {
    parts.push(`${tempo.target} BPM`);
  } else if (Number.isFinite(tempo.start)) {
    parts.push(`${tempo.start} BPM`);
  }
  if (Number.isFinite(tempo.increment) && tempo.increment > 0) {
    parts.push(`+${tempo.increment}`);
  }
  const loopLabel = formatLoopLabel(tempo);
  if (loopLabel) parts.push(loopLabel);
  return parts.length ? parts.join(' · ') : 'Tempo details unavailable';
};

const formatMidiReference = (ref, lookup) => {
  if (!ref) return null;
  if (ref.kind === 'builtin' && ref.id) {
    const label = lookup?.get(ref.id);
    return `Built-in track: ${label || ref.id}`;
  }
  if (ref.kind === 'custom') {
    return `Custom track: ${ref.name || 'Uploaded file'}`;
  }
  return null;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const createDefaultExercise = (section) => ({
  id: `temp-${Math.random().toString(16).slice(2)}`,
  type: 'note',
  label: 'New Exercise',
  notes: '',
  section: section || 'fundamentals',
  durationMinutes: 5,
  tempo: {
    start: 120,
    target: 140,
    increment: 4,
    loopMode: 'bars',
    stepBars: 4,
    stepDurationSec: null,
    fixed: false,
    fixedBpm: null,
  },
  midiReference: null,
});

const ensureTempoShape = (tempo = {}) => ({
  start: Number.isFinite(tempo.start) ? tempo.start : 120,
  target: Number.isFinite(tempo.target) ? tempo.target : Number.isFinite(tempo.start) ? tempo.start : 120,
  increment: Number.isFinite(tempo.increment) ? tempo.increment : 4,
  loopMode: tempo.loopMode === 'time' ? 'time' : 'bars',
  stepBars: Number.isFinite(tempo.stepBars) ? Math.max(1, tempo.stepBars) : 4,
  stepDurationSec: Number.isFinite(tempo.stepDurationSec) ? Math.max(10, tempo.stepDurationSec) : 60,
  fixed: !!tempo.fixed,
  fixedBpm: Number.isFinite(tempo.fixedBpm) ? tempo.fixedBpm : (Number.isFinite(tempo.start) ? tempo.start : 120),
});

const sanitizePlan = (plan) => {
  const draft = deepClone(plan);
  draft.title = draft.title?.trim() || 'Untitled Plan';
  draft.description = draft.description?.trim() || '';
  draft.exercises = Array.isArray(draft.exercises)
    ? draft.exercises.map((ex, index) => ({
        id: ex.id || `plan-${Date.now()}-ex${index + 1}`,
        type: ex.type === 'midi' ? 'midi' : 'note',
        label: ex.label?.trim() || `Exercise ${index + 1}`,
        notes: ex.notes || '',
        section: ex.section || 'fundamentals',
        durationMinutes: Number.isFinite(ex.durationMinutes) ? Math.max(1, Math.round(ex.durationMinutes)) : 5,
        tempo: ensureTempoShape(ex.tempo),
        midiReference: ex.type === 'midi' ? ex.midiReference || null : null,
      }))
    : [];
  return draft;
};

export function createPracticePlansView(options = {}) {
  const {
    root,
    document = globalThis.document,
    midiLibrary = [],
    onQueuePlan,
    onExportPlan,
    onSelectPlan,
    onSavePlan,
    onDeletePlan,
  } = options;

  if (!root) throw new Error('createPracticePlansView requires a root element');

  const doc = document;
  const sectionOrder = getSectionOrder();
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
    editing: false,
    draft: null,
    editingSource: 'custom',
    editingOriginalId: null,
    editingIsNew: false,
  };

  let listButtons = [];
  let sectionContainers = new Map();
  const sectionSummaries = new Map();
  let totalMinutes = 0;

  root.innerHTML = '';
  root.classList.add('practice-plans-view');

  const layout = doc.createElement('div');
  layout.className = 'plans-layout';

  const listSection = doc.createElement('section');
  listSection.className = 'card plans-column plans-list';

  const listHeader = doc.createElement('div');
  listHeader.className = 'plan-list-header';
  const listTitle = doc.createElement('h3');
  listTitle.textContent = 'Available Plans';
  const newPlanBtn = doc.createElement('button');
  newPlanBtn.type = 'button';
  newPlanBtn.className = 'btn ghost';
  newPlanBtn.textContent = 'New Plan';
  newPlanBtn.addEventListener('click', () => beginCreatePlan());
  listHeader.appendChild(listTitle);
  listHeader.appendChild(newPlanBtn);
  listSection.appendChild(listHeader);

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

  const detailTotals = doc.createElement('div');
  detailTotals.className = 'plan-time-total';
  detailTotals.dataset.testid = 'plan-total';
  detailTotals.textContent = 'Estimated time: —';
  detailHeader.appendChild(detailTotals);

  const editorStatus = doc.createElement('div');
  editorStatus.className = 'plan-editor-status';
  detailHeader.appendChild(editorStatus);

  detailSection.appendChild(detailHeader);

  const sectionsRoot = doc.createElement('div');
  sectionsRoot.className = 'plan-sections';
  detailSection.appendChild(sectionsRoot);

  const controls = doc.createElement('div');
  controls.className = 'plan-controls';
  detailSection.appendChild(controls);

  layout.appendChild(listSection);
  layout.appendChild(detailSection);
  root.appendChild(layout);

  const emptyListNotice = doc.createElement('li');
  emptyListNotice.className = 'empty-state';
  emptyListNotice.textContent = 'No practice plans available yet.';

  const resetSectionContainers = () => {
    sectionsRoot.replaceChildren();
    sectionContainers = new Map();
    sectionOrder.forEach((key) => {
      const wrapper = doc.createElement('section');
      wrapper.className = 'plan-section-block';
      wrapper.dataset.section = key;
      wrapper.dataset.testid = `section-${key}`;

      const heading = doc.createElement('h3');
      heading.className = 'plan-section-title';
      heading.textContent = SECTION_LABELS[key] || key;
      wrapper.appendChild(heading);

      const meta = doc.createElement('div');
      meta.className = 'plan-section-meta';
      meta.dataset.testid = `section-meta-${key}`;
      meta.textContent = '0 min';
      wrapper.appendChild(meta);

      const list = doc.createElement('ol');
      list.className = 'exercise-list';
      list.dataset.testid = `section-list-${key}`;
      wrapper.appendChild(list);

      sectionsRoot.appendChild(wrapper);
      sectionContainers.set(key, { wrapper, heading, meta, list });
    });
  };

  resetSectionContainers();

  const getEntry = (id) => {
    if (!id) return null;
    return state.planMap.get(id) || null;
  };

  const renderList = () => {
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
      if (entry.source === 'builtin') button.classList.add('builtin');
      button.dataset.planId = entry.id;
      button.textContent = entry.title || entry.plan?.title || 'Untitled Plan';
      button.classList.toggle('active', entry.id === state.selectedId && !state.editing);
      button.addEventListener('click', (event) => {
        event?.preventDefault?.();
        if (state.editing) return; // prevent switching while editing
        selectPlan(entry.id);
      });
      item.appendChild(button);
      planList.appendChild(item);
      listButtons.push(button);
    });
  };

  const collectExercisesBySection = (plan) => {
    const grouped = new Map();
    sectionOrder.forEach((key) => grouped.set(key, []));
    (plan?.exercises || []).forEach((exercise) => {
      const bucket = grouped.get(exercise.section) || grouped.get('fundamentals');
      bucket.push(exercise);
    });
    return grouped;
  };

  const renderReadOnlySection = (key, exercises) => {
    const container = sectionContainers.get(key);
    if (!container) return;
    const { list, meta } = container;
    list.replaceChildren();
    if (exercises.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No activities in this section yet.';
      list.appendChild(empty);
      sectionSummaries.set(key, { minutes: 0, count: 0 });
      return;
    }
    let minutes = 0;
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
      const metaInfo = doc.createElement('div');
      metaInfo.className = 'exercise-meta';
      metaInfo.textContent = metaParts.join(' · ');
      item.appendChild(metaInfo);
      const duration = doc.createElement('div');
      duration.className = 'exercise-duration';
      duration.textContent = formatMinutesLabel(exercise.durationMinutes);
      item.appendChild(duration);
      if (exercise.notes) {
        const notes = doc.createElement('div');
        notes.className = 'exercise-notes';
        notes.textContent = exercise.notes;
        item.appendChild(notes);
      }
      list.appendChild(item);
      minutes += Number.isFinite(exercise.durationMinutes) ? exercise.durationMinutes : 0;
    });
    meta.textContent = `${minutes} min • ${exercises.length} ${exercises.length === 1 ? 'activity' : 'activities'}`;
    sectionSummaries.set(key, { minutes, count: exercises.length });
  };

  const createInput = (type, value, attrs = {}) => {
    const input = doc.createElement('input');
    input.type = type;
    input.value = value ?? '';
    Object.entries(attrs).forEach(([key, attrValue]) => {
      if (attrValue !== undefined && attrValue !== null) input.setAttribute(key, attrValue);
    });
    return input;
  };

  const renderEditableSection = (plan, key, exercises) => {
    const container = sectionContainers.get(key);
    if (!container) return;
    const { list, meta } = container;
    list.replaceChildren();
    let minutes = 0;

    exercises.forEach((exercise) => {
      const item = doc.createElement('li');
      item.className = 'exercise-item editing';
      item.dataset.exerciseId = exercise.id;

      const headerRow = doc.createElement('div');
      headerRow.className = 'exercise-edit-row';

      const labelInput = createInput('text', exercise.label, {
        placeholder: 'Exercise title',
      });
      labelInput.addEventListener('input', () => {
        exercise.label = labelInput.value;
      });
      headerRow.appendChild(labelInput);

      const typeSelect = doc.createElement('select');
      ['note', 'midi'].forEach((value) => {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = value === 'midi' ? 'MIDI' : 'Notes';
        if (exercise.type === value) option.selected = true;
        typeSelect.appendChild(option);
      });
      typeSelect.addEventListener('change', () => {
        exercise.type = typeSelect.value === 'midi' ? 'midi' : 'note';
        if (exercise.type !== 'midi') {
          exercise.midiReference = null;
        } else if (!exercise.midiReference) {
          exercise.midiReference = { kind: 'builtin', id: '' };
        }
        renderDetail();
      });
      headerRow.appendChild(typeSelect);

      const deleteBtn = doc.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn ghost';
      deleteBtn.textContent = 'Remove';
      deleteBtn.addEventListener('click', () => {
        plan.exercises = plan.exercises.filter((ex) => ex.id !== exercise.id);
        renderDetail();
      });
      headerRow.appendChild(deleteBtn);

      list.appendChild(headerRow);

      const notesArea = doc.createElement('textarea');
      notesArea.className = 'exercise-notes-edit';
      notesArea.value = exercise.notes || '';
      notesArea.placeholder = 'Notes';
      notesArea.addEventListener('input', () => {
        exercise.notes = notesArea.value;
      });
      list.appendChild(notesArea);

      const durationRow = doc.createElement('div');
      durationRow.className = 'exercise-edit-row';
      const durationInput = createInput('number', exercise.durationMinutes, { min: '1' });
      durationInput.addEventListener('input', () => {
        const next = Number(durationInput.value);
        exercise.durationMinutes = Number.isFinite(next) ? Math.max(1, Math.round(next)) : exercise.durationMinutes;
      });
      const durationLabel = doc.createElement('label');
      durationLabel.textContent = 'Duration (min)';
      durationLabel.appendChild(durationInput);
      durationRow.appendChild(durationLabel);
      list.appendChild(durationRow);

      const tempoRow = doc.createElement('div');
      tempoRow.className = 'tempo-editor';

      const fixedToggle = doc.createElement('label');
      fixedToggle.className = 'tempo-toggle';
      const fixedCheckbox = createInput('checkbox', '', {});
      fixedCheckbox.checked = !!exercise.tempo.fixed;
      fixedCheckbox.addEventListener('change', () => {
        exercise.tempo.fixed = fixedCheckbox.checked;
        renderDetail();
      });
      fixedToggle.appendChild(fixedCheckbox);
      fixedToggle.appendChild(doc.createTextNode(' Fixed BPM'));
      tempoRow.appendChild(fixedToggle);

      if (exercise.tempo.fixed) {
        const fixedInput = createInput('number', exercise.tempo.fixedBpm, { min: '20', max: '300' });
        fixedInput.addEventListener('input', () => {
          const next = Number(fixedInput.value);
          if (Number.isFinite(next)) exercise.tempo.fixedBpm = next;
        });
        const fixedLabel = doc.createElement('label');
        fixedLabel.textContent = 'Fixed BPM';
        fixedLabel.appendChild(fixedInput);
        tempoRow.appendChild(fixedLabel);
      } else {
        const startInput = createInput('number', exercise.tempo.start, { min: '20', max: '300' });
        startInput.addEventListener('input', () => {
          const next = Number(startInput.value);
          if (Number.isFinite(next)) exercise.tempo.start = next;
        });
        const startLabel = doc.createElement('label');
        startLabel.textContent = 'Start BPM';
        startLabel.appendChild(startInput);
        tempoRow.appendChild(startLabel);

        const targetInput = createInput('number', exercise.tempo.target, { min: '20', max: '300' });
        targetInput.addEventListener('input', () => {
          const next = Number(targetInput.value);
          if (Number.isFinite(next)) exercise.tempo.target = next;
        });
        const targetLabel = doc.createElement('label');
        targetLabel.textContent = 'Target BPM';
        targetLabel.appendChild(targetInput);
        tempoRow.appendChild(targetLabel);

        const incrementInput = createInput('number', exercise.tempo.increment, { min: '0', max: '40' });
        incrementInput.addEventListener('input', () => {
          const next = Number(incrementInput.value);
          if (Number.isFinite(next)) exercise.tempo.increment = Math.max(0, next);
        });
        const incrementLabel = doc.createElement('label');
        incrementLabel.textContent = 'Increment';
        incrementLabel.appendChild(incrementInput);
        tempoRow.appendChild(incrementLabel);
      }

      const loopSelect = doc.createElement('select');
      ['bars', 'time'].forEach((mode) => {
        const option = doc.createElement('option');
        option.value = mode;
        option.textContent = mode === 'bars' ? 'Bars' : 'Time';
        if (exercise.tempo.loopMode === mode) option.selected = true;
        loopSelect.appendChild(option);
      });
      loopSelect.addEventListener('change', () => {
        exercise.tempo.loopMode = loopSelect.value === 'time' ? 'time' : 'bars';
        renderDetail();
      });
      const loopLabel = doc.createElement('label');
      loopLabel.textContent = 'Loop Mode';
      loopLabel.appendChild(loopSelect);
      tempoRow.appendChild(loopLabel);

      if (exercise.tempo.loopMode === 'bars') {
        const barsInput = createInput('number', exercise.tempo.stepBars, { min: '1' });
        barsInput.addEventListener('input', () => {
          const next = Number(barsInput.value);
          if (Number.isFinite(next)) exercise.tempo.stepBars = Math.max(1, Math.round(next));
        });
        const barsLabel = doc.createElement('label');
        barsLabel.textContent = 'Bars per step';
        barsLabel.appendChild(barsInput);
        tempoRow.appendChild(barsLabel);
      } else {
        const timeInput = createInput('number', exercise.tempo.stepDurationSec, { min: '10' });
        timeInput.addEventListener('input', () => {
          const next = Number(timeInput.value);
          if (Number.isFinite(next)) exercise.tempo.stepDurationSec = Math.max(10, next);
        });
        const timeLabel = doc.createElement('label');
        timeLabel.textContent = 'Loop duration (sec)';
        timeLabel.appendChild(timeInput);
        tempoRow.appendChild(timeLabel);
      }

      if (exercise.type === 'midi') {
        const midiLabel = doc.createElement('label');
        midiLabel.textContent = 'MIDI Track';
        const midiSelect = doc.createElement('select');
        const noneOption = doc.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'None';
        midiSelect.appendChild(noneOption);
        midiLibrary.forEach((item) => {
          const option = doc.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          if (exercise.midiReference?.id === item.id) option.selected = true;
          midiSelect.appendChild(option);
        });
        midiSelect.addEventListener('change', () => {
          const id = midiSelect.value;
          exercise.midiReference = id ? { kind: 'builtin', id } : null;
        });
        midiLabel.appendChild(midiSelect);
        tempoRow.appendChild(midiLabel);
      }

      list.appendChild(tempoRow);

      minutes += Number.isFinite(exercise.durationMinutes) ? exercise.durationMinutes : 0;
    });

    const addButton = doc.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn ghost';
    addButton.textContent = 'Add Activity';
    addButton.addEventListener('click', () => {
      plan.exercises.push(createDefaultExercise(key));
      renderDetail();
    });
    list.appendChild(addButton);

    meta.textContent = `${minutes} min • ${exercises.length} ${exercises.length === 1 ? 'activity' : 'activities'}`;
    sectionSummaries.set(key, { minutes, count: exercises.length });
  };

  const renderSections = (plan, editable) => {
    sectionSummaries.clear();
    totalMinutes = 0;
    resetSectionContainers();
    const grouped = collectExercisesBySection(plan);
    sectionOrder.forEach((key) => {
      const exercises = grouped.get(key) || [];
      if (editable) {
        renderEditableSection(plan, key, exercises);
      } else {
        renderReadOnlySection(key, exercises);
      }
      const summary = sectionSummaries.get(key) || { minutes: 0, count: 0 };
      totalMinutes += summary.minutes;
    });
    detailTotals.textContent = totalMinutes > 0 ? `Estimated time: ${totalMinutes} min` : 'Estimated time: —';
  };

  const exitEditing = () => {
    state.editing = false;
    state.draft = null;
    state.editingIsNew = false;
    state.editingSource = 'custom';
    state.editingOriginalId = null;
  };

  const renderDetail = () => {
    const entry = state.editing
      ? {
          id: state.draft.id,
          title: state.draft.title,
          description: state.draft.description,
          plan: state.draft,
          source: state.editingSource,
        }
      : getEntry(state.selectedId);

    controls.replaceChildren();

    if (!entry) {
      detailTitle.textContent = 'Select a plan to inspect its exercises';
      detailDescription.textContent = 'Choose a plan from the left to view tempo targets, notes, and durations.';
      editorStatus.textContent = '';
      renderSections({ exercises: [] }, false);
      return;
    }

    const plan = state.editing ? state.draft : entry.plan;
    detailTitle.textContent = plan.title || 'Practice Plan';
    detailDescription.textContent = plan.description || '';
    editorStatus.textContent = state.editing
      ? state.editingIsNew
        ? 'Editing new plan'
        : 'Editing plan'
      : '';

    renderSections(plan, state.editing);

    if (state.editing) {
      const saveBtn = doc.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn';
      saveBtn.textContent = 'Save Plan';
      saveBtn.addEventListener('click', () => {
        const cleaned = sanitizePlan(state.draft);
        onSavePlan?.(cleaned, {
          isNew: state.editingIsNew,
          source: state.editingSource,
          originalId: state.editingOriginalId,
        });
        exitEditing();
        renderList();
        renderDetail();
      });

      const cancelBtn = doc.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn ghost';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        exitEditing();
        renderList();
        renderDetail();
      });

      controls.appendChild(cancelBtn);
      controls.appendChild(saveBtn);

      if (!state.editingIsNew && state.editingSource === 'custom') {
        const deleteBtn = doc.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn ghost';
        deleteBtn.textContent = 'Delete Plan';
        deleteBtn.addEventListener('click', () => {
          onDeletePlan?.({ id: state.editingOriginalId || state.draft.id, source: state.editingSource });
          exitEditing();
          renderList();
          renderDetail();
        });
        controls.appendChild(deleteBtn);
      }
    } else {
      const loadBtn = doc.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn';
      loadBtn.textContent = 'Load into Metronome';
      loadBtn.addEventListener('click', () => onQueuePlan?.(entry.plan));
      controls.appendChild(loadBtn);

      const exportBtn = doc.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'btn ghost';
      exportBtn.textContent = 'Export JSON';
      exportBtn.addEventListener('click', () => onExportPlan?.(entry.plan, serializePlan(entry.plan)));
      controls.appendChild(exportBtn);

      const editBtn = doc.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn ghost';
      editBtn.textContent = entry.source === 'custom' ? 'Edit Plan' : 'Edit Copy';
      editBtn.addEventListener('click', () => beginEditPlan(entry));
      controls.appendChild(editBtn);

      if (entry.source === 'custom') {
        const deleteBtn = doc.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn ghost';
        deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        onDeletePlan?.(entry);
      });
        controls.appendChild(deleteBtn);
      }
    }
  };

  const setPlans = (plans = []) => {
    state.plans = Array.isArray(plans)
      ? plans.map((entry) => ({
          id: entry.id || entry.plan?.id,
          title: entry.title ?? entry.plan?.title ?? 'Untitled Plan',
          description: entry.description ?? entry.plan?.description ?? '',
          plan: entry.plan ?? null,
          source: entry.source === 'builtin' ? 'builtin' : 'custom',
        })).filter((entry) => entry.id && entry.plan)
      : [];

    state.planMap = new Map(state.plans.map((entry) => [entry.id, entry]));

    if (!state.editing) {
      if (!state.planMap.has(state.selectedId)) {
        state.selectedId = state.plans[0]?.id ?? null;
      }
    }

    renderList();
    renderDetail();

    if (!state.editing) {
      const entry = getEntry(state.selectedId);
      if (entry && typeof onSelectPlan === 'function') {
        onSelectPlan(entry.plan);
      }
    }
  };

  const selectPlan = (id) => {
    if (state.editing) return null;
    if (!state.planMap.has(id)) return null;
    state.selectedId = id;
    renderList();
    renderDetail();
    const entry = getEntry(id);
    if (entry && typeof onSelectPlan === 'function') {
      onSelectPlan(entry.plan);
    }
    return entry?.plan ?? null;
  };

  const beginEditPlan = (entry) => {
    state.editing = true;
    state.editingSource = entry.source;
    state.editingOriginalId = entry.id;
    state.editingIsNew = entry.source !== 'custom';
    const basePlan = deepClone(entry.plan);
    if (state.editingIsNew) {
      basePlan.id = `temp-${Math.random().toString(16).slice(2)}`;
    }
    basePlan.exercises = basePlan.exercises.map((exercise) => ({
      ...exercise,
      tempo: ensureTempoShape(exercise.tempo),
    }));
    state.draft = basePlan;
    state.selectedId = entry.id;
    renderList();
    renderDetail();
  };

  const beginCreatePlan = () => {
    state.editing = true;
    state.editingIsNew = true;
    state.editingSource = 'custom';
    state.editingOriginalId = null;
    state.selectedId = null;
    state.draft = sanitizePlan({
      id: `temp-${Math.random().toString(16).slice(2)}`,
      title: 'New Practice Plan',
      description: '',
      exercises: [],
    });
    renderList();
    renderDetail();
  };

  const getSelectedPlan = () => {
    if (state.editing && state.draft) return state.draft;
    const entry = getEntry(state.selectedId);
    return entry?.plan ?? null;
  };

  const getPlanListItems = () => listButtons.slice();

  const getExercisesBySection = (section) => {
    const container = sectionContainers.get(section);
    if (!container) return [];
    return Array.from(container.list.children || []).filter(
      (child) => child?.dataset && child.dataset.exerciseId
    );
  };

  const getRenderedSectionSummaries = () => {
    const result = {};
    sectionOrder.forEach((key) => {
      result[key] = { ...(sectionSummaries.get(key) || { minutes: 0, count: 0 }) };
    });
    return result;
  };

  const getRenderedTotalMinutes = () => totalMinutes;

  setPlans(options.initialPlans || []);

  return {
    setPlans,
    selectPlan,
    getSelectedPlan,
    getPlanListItems,
    getExercisesBySection,
    getRenderedSectionSummaries,
    getRenderedTotalMinutes,
    beginEdit: (id) => {
      const entry = getEntry(id);
      if (entry) beginEditPlan(entry);
    },
    beginCreatePlan,
    isEditing: () => state.editing,
    getDraft: () => (state.editing ? state.draft : null),
    finishEditing: (selectedId) => {
      exitEditing();
      if (selectedId) {
        state.selectedId = selectedId;
      }
      renderList();
      renderDetail();
    },
    saveDraft: () => {
      if (!state.editing || !state.draft) return;
      const cleaned = sanitizePlan(state.draft);
      onSavePlan?.(cleaned, {
        isNew: state.editingIsNew,
        source: state.editingSource,
        originalId: state.editingOriginalId,
      });
      exitEditing();
      renderList();
      renderDetail();
    },
    cancelEdit: () => {
      if (!state.editing) return;
      exitEditing();
      renderList();
      renderDetail();
    },
    exportActivePlan: () => {
      const plan = getSelectedPlan();
      if (!plan) return null;
      const json = serializePlan(plan);
      onExportPlan?.(plan, json);
      return json;
    },
    deletePlan: (id) => {
      const entry = getEntry(id);
      if (!entry) return;
      onDeletePlan?.(entry);
    },
  };
}
