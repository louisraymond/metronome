import { getSectionOrder, SECTION_LABELS } from './practicePlans.js';

const formatMinutes = (minutes) => {
  if (!Number.isFinite(minutes)) return '0 min';
  if (minutes <= 0) return '0 min';
  return `${minutes} min`;
};

const getSectionLabel = (sectionLabels, key) => sectionLabels[key] || SECTION_LABELS[key] || key;

export function createPracticeSessionView({
  root,
  document = globalThis.document,
  sectionLabels = SECTION_LABELS,
  onComplete,
  onSkip,
  onPrev,
  onStop,
  onOverride,
} = {}) {
  if (!root) {
    throw new Error('createPracticeSessionView requires a root element');
  }

  const doc = document;
  const sectionOrder = getSectionOrder();

  root.classList.add('practice-session-view');

  const header = doc.createElement('div');
  header.className = 'session-header';

  const statusEl = doc.createElement('div');
  statusEl.className = 'session-status';
  statusEl.dataset.testid = 'session-status';
  header.appendChild(statusEl);

  const summaryEl = doc.createElement('div');
  summaryEl.className = 'session-summary';
  summaryEl.dataset.testid = 'session-summary';
  header.appendChild(summaryEl);

  const overrideForm = doc.createElement('div');
  overrideForm.className = 'session-override';
  overrideForm.dataset.testid = 'session-override';

  const overrideTitle = doc.createElement('div');
  overrideTitle.className = 'session-override-title';
  overrideTitle.textContent = 'Tempo Override (session only)';
  overrideForm.appendChild(overrideTitle);

  const overrideFields = doc.createElement('div');
  overrideFields.className = 'session-override-fields';
  overrideForm.appendChild(overrideFields);

  const fixedLabel = document.createElement('label');
  fixedLabel.className = 'session-override-fixed';
  const fixedCheckbox = document.createElement('input');
  fixedCheckbox.type = 'checkbox';
  fixedCheckbox.dataset.testid = 'override-fixed';
  fixedLabel.appendChild(fixedCheckbox);
  fixedLabel.appendChild(document.createTextNode(' Fixed BPM'));
  overrideFields.appendChild(fixedLabel);

  const fixedInputLabel = document.createElement('label');
  fixedInputLabel.textContent = 'Fixed';
  const fixedInput = document.createElement('input');
  fixedInput.type = 'number';
  fixedInput.min = '20';
  fixedInput.max = '300';
  fixedInput.dataset.testid = 'override-fixed-bpm';
  fixedInputLabel.appendChild(fixedInput);
  overrideFields.appendChild(fixedInputLabel);

  const rangeGroup = document.createElement('div');
  rangeGroup.className = 'session-override-range';

  const startLabel = document.createElement('label');
  startLabel.textContent = 'Start';
  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.min = '20';
  startInput.max = '300';
  startInput.dataset.testid = 'override-start';
  startLabel.appendChild(startInput);
  rangeGroup.appendChild(startLabel);

  const targetLabel = document.createElement('label');
  targetLabel.textContent = 'Target';
  const targetInput = document.createElement('input');
  targetInput.type = 'number';
  targetInput.min = '20';
  targetInput.max = '300';
  targetInput.dataset.testid = 'override-target';
  targetLabel.appendChild(targetInput);
  rangeGroup.appendChild(targetLabel);

  const incrementLabel = document.createElement('label');
  incrementLabel.textContent = 'Step';
  const incrementInput = document.createElement('input');
  incrementInput.type = 'number';
  incrementInput.min = '0';
  incrementInput.max = '40';
  incrementInput.dataset.testid = 'override-increment';
  incrementLabel.appendChild(incrementInput);
  rangeGroup.appendChild(incrementLabel);

  overrideFields.appendChild(rangeGroup);

  header.appendChild(overrideForm);

  const entriesList = doc.createElement('ol');
  entriesList.className = 'session-entries';
  entriesList.dataset.testid = 'session-entries';

  const actions = doc.createElement('div');
  actions.className = 'session-actions';

  const makeButton = (label, testId, handler) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost session-action';
    btn.textContent = label;
    btn.dataset.testid = testId;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      handler?.();
    });
    return btn;
  };

  const completeBtn = makeButton('Complete', 'session-complete', onComplete);
  const skipBtn = makeButton('Skip', 'session-skip', onSkip);
  const prevBtn = makeButton('Previous', 'session-prev', onPrev);
  const stopBtn = makeButton('End Session', 'session-stop', onStop);

  actions.appendChild(prevBtn);
  actions.appendChild(skipBtn);
  actions.appendChild(completeBtn);
  actions.appendChild(stopBtn);

  root.replaceChildren(header, entriesList, actions);

  let currentProgress = null;
  let currentActiveId = null;

  const setButtonsEnabled = (hasActive) => {
    completeBtn.disabled = !hasActive;
    skipBtn.disabled = !hasActive;
    prevBtn.disabled = !hasActive;
    stopBtn.disabled = !hasActive && !currentProgress;
    overrideForm.classList.toggle('hidden', !hasActive);
  };

  const renderEmpty = () => {
    currentProgress = null;
    currentActiveId = null;
    statusEl.textContent = 'No practice session loaded.';
    summaryEl.textContent = 'Load a plan from Practice Plans to begin.';
    entriesList.replaceChildren();
    setButtonsEnabled(false);
  };

  const emitOverride = () => {
    if (!currentActiveId) return;
    const payload = {
      fixed: fixedCheckbox.checked,
    };
    if (payload.fixed) {
      const bpm = Number(fixedInput.value);
      if (Number.isFinite(bpm)) payload.fixedBpm = bpm;
    } else {
      const start = Number(startInput.value);
      const target = Number(targetInput.value);
      const increment = Number(incrementInput.value);
      if (Number.isFinite(start)) payload.startBpm = start;
      if (Number.isFinite(target)) payload.targetBpm = target;
      if (Number.isFinite(increment)) payload.increment = increment;
    }
    onOverride?.(currentActiveId, payload);
  };

  fixedCheckbox.addEventListener('change', () => {
    const fixed = fixedCheckbox.checked;
    rangeGroup.classList.toggle('hidden', fixed);
    fixedInput.disabled = !fixed;
    emitOverride();
  });
  fixedInput.addEventListener('input', emitOverride);
  startInput.addEventListener('input', emitOverride);
  targetInput.addEventListener('input', emitOverride);
  incrementInput.addEventListener('input', emitOverride);

  const renderEntries = (progress) => {
    entriesList.replaceChildren();
    if (!progress.entries?.length) return;
    progress.entries.forEach((entry) => {
      const item = doc.createElement('li');
      item.className = 'session-entry';
      item.dataset.exerciseId = entry.exercise.id;
      item.dataset.section = entry.exercise.section;
      item.dataset.index = entry.index;
      if (entry.status === 'complete') item.classList.add('complete');
      if (entry.status === 'skipped') item.classList.add('skipped');
      if (entry.index === progress.activeIndex) item.classList.add('active');
      const title = doc.createElement('div');
      title.className = 'session-entry-title';
      title.textContent = entry.exercise.label;
      item.appendChild(title);
      const meta = doc.createElement('div');
      meta.className = 'session-entry-meta';
      const sectionLabel = getSectionLabel(sectionLabels, entry.exercise.section);
      meta.textContent = `${sectionLabel} • ${formatMinutes(entry.exercise.durationMinutes)}`;
      item.appendChild(meta);
      entriesList.appendChild(item);
    });
  };

  renderEmpty();

  return {
    render(progress) {
      if (!progress || !progress.plan) {
        renderEmpty();
        return;
      }
      currentProgress = progress;
      const { active } = progress;
      const overrides = progress.overrides || {};
      let override = null;
      if (active?.exercise) {
        override = overrides[active.exercise.id] || null;
      }
      if (active?.exercise) {
        const sectionLabel = getSectionLabel(sectionLabels, active.exercise.section);
        statusEl.textContent = `Current: ${active.exercise.label} (${sectionLabel})`;
      } else {
        statusEl.textContent = `Session complete — ${progress.plan.title}`;
      }
      summaryEl.textContent = `${formatMinutes(progress.completedMinutes)} done • ${formatMinutes(progress.remainingMinutes)} remaining`;
      renderEntries(progress);
      const hasActive = Boolean(active?.exercise);
      setButtonsEnabled(hasActive);

      if (hasActive) {
        currentActiveId = active.exercise.id;
        const tempo = { ...active.exercise.tempo };
        if (override) {
          if (override.fixed !== undefined) tempo.fixed = !!override.fixed;
          if (Number.isFinite(override.fixedBpm)) tempo.fixedBpm = override.fixedBpm;
          if (Number.isFinite(override.startBpm)) tempo.start = override.startBpm;
          if (Number.isFinite(override.targetBpm)) tempo.target = override.targetBpm;
          if (Number.isFinite(override.increment)) tempo.increment = override.increment;
        }
        fixedCheckbox.checked = !!tempo.fixed;
        fixedInput.value = tempo.fixedBpm ?? tempo.start ?? 120;
        startInput.value = tempo.start ?? '';
        targetInput.value = tempo.target ?? '';
        incrementInput.value = tempo.increment ?? '';
        rangeGroup.classList.toggle('hidden', !!tempo.fixed);
        fixedInput.disabled = !tempo.fixed;
      } else {
        currentActiveId = null;
      }
    },
    setIdle() {
      renderEmpty();
    },
  };
}
