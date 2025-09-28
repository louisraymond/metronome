import assert from 'node:assert/strict';
import { parsePlan, serializePlan } from '../app/practicePlans.js';
import { createPracticePlansView } from '../app/practicePlansView.js';

class FakeClassList {
  constructor(element) {
    this.element = element;
    this._classes = new Set();
  }

  add(...classes) {
    classes.forEach((cls) => this._classes.add(cls));
  }

  remove(...classes) {
    classes.forEach((cls) => this._classes.delete(cls));
  }

  toggle(cls, force) {
    if (force === true) {
      this._classes.add(cls);
      return true;
    }
    if (force === false) {
      this._classes.delete(cls);
      return false;
    }
    if (this._classes.has(cls)) {
      this._classes.delete(cls);
      return false;
    }
    this._classes.add(cls);
    return true;
  }

  contains(cls) {
    return this._classes.has(cls);
  }

  toString() {
    return Array.from(this._classes).join(' ');
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.classList = new FakeClassList(this);
    this.attributes = {};
    this.eventListeners = new Map();
    this.disabled = false;
    this._textContent = '';
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((child) => child.textContent ?? '').join('');
  }

  set textContent(value) {
    this._textContent = value ?? '';
    this.children = [];
  }

  appendChild(child) {
    if (child.parentNode) {
      const index = child.parentNode.children.indexOf(child);
      if (index >= 0) child.parentNode.children.splice(index, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    const list = this.eventListeners.get(type) || [];
    list.push(handler);
    this.eventListeners.set(type, list);
  }

  dispatchEvent(type, event = {}) {
    const list = this.eventListeners.get(type) || [];
    list.forEach((handler) => {
      handler({
        ...event,
        type,
        currentTarget: this,
        target: event.target || this,
        preventDefault: event.preventDefault || (() => {}),
      });
    });
  }

  querySelector(selector) {
    if (selector.startsWith('[data-testid="')) {
      const key = selector.slice(13, -2);
      return this.findByTestId(key);
    }
    return null;
  }

  findByTestId(value) {
    if (this.dataset?.testid === value) return this;
    for (const child of this.children) {
      const found = child.findByTestId?.(value);
      if (found) return found;
    }
    return null;
  }

  get innerHTML() {
    if (!this.children.length) return this.textContent;
    return this.children.map((child) => child.innerHTML ?? child.textContent ?? '').join('');
  }

  set innerHTML(value) {
    this._textContent = value ?? '';
    this.children = [];
  }
}

class FakeDocument {
  createElement(tag) {
    return new FakeElement(tag, this);
  }

  createTextNode(text) {
    const node = new FakeElement('#text', this);
    node.textContent = text;
    return node;
  }
}

function buildPlan(raw) {
  return parsePlan(raw);
}

function setupView(overrides = {}) {
  const document = new FakeDocument();
  const root = document.createElement('section');
  const loadCalls = [];
  const exportCalls = [];

  const view = createPracticePlansView({
    root,
    document,
    onQueuePlan: (plan) => loadCalls.push(plan),
    onExportPlan: (plan, json) => exportCalls.push({ plan, json }),
    ...overrides,
  });

  return { document, root, view, loadCalls, exportCalls };
}

test('renders plan list and selecting a plan shows its exercises', () => {
  const warmupPlan = buildPlan({
    id: 'warmup',
    title: 'Warmup Drills',
    description: 'Loosen up',
    exercises: [
      {
        id: 'ex1',
        type: 'note',
        label: 'Chromatic ladder',
        notes: 'Ascending + descending',
        tempo: { start: 90, target: 110, increment: 5, loopMode: 'bars', stepBars: 4 },
      },
      {
        id: 'ex2',
        type: 'midi',
        label: 'Scale with MIDI',
        notes: 'Play with backing track',
        tempo: { start: 100, target: 120, increment: 4, loopMode: 'time', stepDurationSec: 90 },
        midiReference: { kind: 'builtin', id: 'type-ab-voicings' },
      },
    ],
  });

  const voicingsPlan = buildPlan({
    id: 'voicings',
    title: 'Voicing Focus',
    description: 'Comping shapes',
    exercises: [
      {
        id: 'exA',
        type: 'midi',
        label: 'Drop 2 cycle',
        notes: 'Keep it smooth',
        tempo: { start: 120, target: 160, increment: 8, loopMode: 'bars', stepBars: 8 },
        midiReference: { kind: 'builtin', id: 'descending-cycle' },
      },
    ],
  });

  const { view } = setupView();

  view.setPlans([
    { id: warmupPlan.id, title: warmupPlan.title, description: warmupPlan.description, plan: warmupPlan },
    { id: voicingsPlan.id, title: voicingsPlan.title, description: voicingsPlan.description, plan: voicingsPlan },
  ]);

  const listItems = view.getPlanListItems();
  assert.equal(listItems.length, 2);
  assert.equal(listItems[0].textContent, 'Warmup Drills');
  assert.equal(listItems[1].textContent, 'Voicing Focus');

  assert.equal(view.getSelectedPlan().id, warmupPlan.id);
  let exerciseItems = view.getExerciseItems();
  assert.equal(exerciseItems.length, warmupPlan.exercises.length);
  assert.equal(exerciseItems[0].dataset.exerciseId, 'ex1');

  view.selectPlan('voicings');
  assert.equal(view.getSelectedPlan().id, voicingsPlan.id);

  exerciseItems = view.getExerciseItems();
  assert.equal(exerciseItems.length, voicingsPlan.exercises.length);
  assert.equal(exerciseItems[0].textContent.includes('Drop 2 cycle'), true);
});

test('exporting the active plan returns serialized JSON and triggers callback', () => {
  const plan = buildPlan({
    id: 'session',
    title: 'Session Plan',
    description: 'Evening work',
    exercises: [
      {
        id: 'text-1',
        type: 'note',
        label: 'Arpeggios',
        notes: 'Major/minor inversions',
        tempo: { start: 80, target: 110, increment: 5, loopMode: 'bars', stepBars: 6 },
      },
    ],
  });

  const { view, exportCalls } = setupView();

  view.setPlans([
    { id: plan.id, title: plan.title, description: plan.description, plan },
  ]);

  const json = view.exportActivePlan();
  assert.ok(json.includes('Session Plan'));
  const parsed = JSON.parse(json);
  const expected = JSON.parse(serializePlan(plan));
  assert.deepEqual(parsed, expected);

  assert.equal(exportCalls.length, 1);
  assert.equal(exportCalls[0].plan.id, plan.id);
  assert.equal(exportCalls[0].json, json);
});
