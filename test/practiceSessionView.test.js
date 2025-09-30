import assert from 'node:assert/strict';
import { SECTION_LABELS } from '../app/practicePlans.js';

class FakeClassList {
  constructor() {
    this._classes = new Set();
  }
  add(...classes) { classes.forEach((cls) => this._classes.add(cls)); }
  remove(...classes) { classes.forEach((cls) => this._classes.delete(cls)); }
  toggle(cls, force) {
    if (force === true) { this._classes.add(cls); return true; }
    if (force === false) { this._classes.delete(cls); return false; }
    if (this._classes.has(cls)) { this._classes.delete(cls); return false; }
    this._classes.add(cls);
    return true;
  }
  contains(cls) { return this._classes.has(cls); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.textContent = '';
    this.classList = new FakeClassList();
    this.attributes = {};
    this.eventListeners = new Map();
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, handler) {
    const list = this.eventListeners.get(type) || [];
    list.push(handler);
    this.eventListeners.set(type, list);
  }
  dispatchEvent(type, payload = {}) {
    const list = this.eventListeners.get(type) || [];
    list.forEach((handler) => handler({
      type,
      currentTarget: this,
      preventDefault() {},
      ...payload,
    }));
  }
  findByTestId(testId) {
    if (this.dataset?.testid === testId) return this;
    for (const child of this.children) {
      const found = child.findByTestId?.(testId);
      if (found) return found;
    }
    return null;
  }
}

class FakeDocument {
  createElement(tag) {
    return new FakeElement(tag, this);
  }

  createTextNode(text) {
    const node = new FakeElement('#text', this);
    node.textContent = text ?? '';
    return node;
  }
}

const buildProgress = () => ({
  plan: { id: 'plan', title: 'Session Plan' },
  activeIndex: 1,
  active: {
    index: 1,
    status: 'pending',
    exercise: {
      id: 'ex2',
      label: 'Bud Powell Voicings',
      section: 'outOfContext',
      durationMinutes: 8,
      tempo: { start: 112, target: 140, increment: 4, loopMode: 'bars', stepBars: 4, fixed: false, fixedBpm: null },
    },
  },
  entries: [
    { index: 0, status: 'complete', exercise: { id: 'ex1', label: 'Scales', section: 'fundamentals', durationMinutes: 6, tempo: { start: 100, target: 120, increment: 4, loopMode: 'bars', stepBars: 4, fixed: false, fixedBpm: null } } },
    { index: 1, status: 'pending', exercise: { id: 'ex2', label: 'Bud Powell Voicings', section: 'outOfContext', durationMinutes: 8, tempo: { start: 112, target: 140, increment: 4, loopMode: 'bars', stepBars: 4, fixed: false, fixedBpm: null } } },
    { index: 2, status: 'pending', exercise: { id: 'ex3', label: 'Tune Study', section: 'tunes', durationMinutes: 12, tempo: { start: 120, target: 160, increment: 8, loopMode: 'bars', stepBars: 8, fixed: false, fixedBpm: null } } },
  ],
  totalExercises: 3,
  completedExercises: 1,
  skippedExercises: 0,
  totalMinutes: 26,
  completedMinutes: 6,
  remainingMinutes: 20,
  sections: {
    fundamentals: { totalMinutes: 6, completedMinutes: 6, totalExercises: 1, completedExercises: 1, skippedExercises: 0 },
    outOfContext: { totalMinutes: 8, completedMinutes: 0, totalExercises: 1, completedExercises: 0, skippedExercises: 0 },
    tunes: { totalMinutes: 12, completedMinutes: 0, totalExercises: 1, completedExercises: 0, skippedExercises: 0 },
    interactingWithHistory: { totalMinutes: 0, completedMinutes: 0, totalExercises: 0, completedExercises: 0, skippedExercises: 0 },
  },
});

test('session view renders empty state when no plan is active', async () => {
  const { createPracticeSessionView } = await import('../app/practiceSessionView.js');
  const document = new FakeDocument();
  const root = document.createElement('section');
  const view = createPracticeSessionView({ root, document });
  view.render(null);
  const status = root.findByTestId('session-status');
  assert.ok(status.textContent.includes('No practice session'));
  const list = root.findByTestId('session-entries');
  assert.equal(list.children.length, 0);
});

test('session view highlights current exercise and shows totals', async () => {
  const { createPracticeSessionView } = await import('../app/practiceSessionView.js');
  const document = new FakeDocument();
  const root = document.createElement('section');
  const view = createPracticeSessionView({ root, document, sectionLabels: SECTION_LABELS });
  const progress = buildProgress();
  view.render(progress);
  const status = root.findByTestId('session-status');
  assert.ok(status.textContent.includes('Bud Powell Voicings'));
  const summary = root.findByTestId('session-summary');
  assert.ok(summary.textContent.includes('6 min done'));
  const list = root.findByTestId('session-entries');
  assert.equal(list.children.length, 3);
  const active = list.children[1];
  assert.ok(active.classList.contains('active'));
  const completed = list.children[0];
  assert.ok(completed.classList.contains('complete'));
});

test('session view action buttons call callbacks', async () => {
  const { createPracticeSessionView } = await import('../app/practiceSessionView.js');
  const document = new FakeDocument();
  const root = document.createElement('section');
  let completed = 0;
  let skipped = 0;
  const view = createPracticeSessionView({
    root,
    document,
    onComplete: () => { completed += 1; },
    onSkip: () => { skipped += 1; },
  });
  const progress = buildProgress();
  view.render(progress);
  const completeBtn = root.findByTestId('session-complete');
  const skipBtn = root.findByTestId('session-skip');
  completeBtn.dispatchEvent('click');
  skipBtn.dispatchEvent('click');
  assert.equal(completed, 1);
  assert.equal(skipped, 1);
});

test('session view emits tempo overrides', async () => {
  const { createPracticeSessionView } = await import('../app/practiceSessionView.js');
  const document = new FakeDocument();
  const root = document.createElement('section');
  const overrides = [];
  const view = createPracticeSessionView({
    root,
    document,
    onOverride: (id, payload) => overrides.push({ id, payload }),
  });
  const progress = buildProgress();
  view.render(progress);
  const overrideForm = root.findByTestId('session-override');
  assert.ok(!overrideForm.classList.contains('hidden'));

  const startInput = overrideForm.findByTestId('override-start');
  const targetInput = overrideForm.findByTestId('override-target');
  const incrementInput = overrideForm.findByTestId('override-increment');

  startInput.value = '118';
  startInput.dispatchEvent('input');
  targetInput.value = '146';
  targetInput.dispatchEvent('input');
  incrementInput.value = '3';
  incrementInput.dispatchEvent('input');

  let last = overrides.at(-1);
  assert.equal(last.id, progress.active.exercise.id);
  assert.equal(last.payload.startBpm, 118);
  assert.equal(last.payload.targetBpm, 146);
  assert.equal(last.payload.increment, 3);

  const fixedCheckbox = overrideForm.findByTestId('override-fixed');
  const fixedInput = overrideForm.findByTestId('override-fixed-bpm');
  fixedCheckbox.checked = true;
  fixedCheckbox.dispatchEvent('change');
  fixedInput.value = '150';
  fixedInput.dispatchEvent('input');

  last = overrides.at(-1);
  assert.equal(last.payload.fixed, true);
  assert.equal(last.payload.fixedBpm, 150);
});
