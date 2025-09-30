import assert from 'node:assert/strict';

class FakeClassList {
  constructor() {
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
}

class FakeElement {
  constructor(tagName = 'div', id = null) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.eventListeners = new Map();
    this.parentNode = null;
    this._className = '';
    this._textContent = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') {
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => this.classList.add(cls));
      this._className = String(value);
    }
    if (name.startsWith('data-')) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value ?? '');
    this.classList = new FakeClassList();
    this._className
      .split(/\s+/)
      .filter(Boolean)
      .forEach((cls) => this.classList.add(cls));
  }

  get textContent() {
    if (this.children.length) {
      return this.children.map((child) => child.textContent ?? '').join('');
    }
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      if (child) child.parentNode = null;
    });
    this.children = [];
    this._textContent = '';
    nodes.forEach((node) => {
      if (node) this.appendChild(node);
    });
  }

  addEventListener(type, handler) {
    const list = this.eventListeners.get(type) || [];
    list.push(handler);
    this.eventListeners.set(type, list);
  }

  dispatchEvent(type, payload = {}) {
    const list = this.eventListeners.get(type) || [];
    list.forEach((handler) => {
      handler({
        type,
        target: this,
        currentTarget: this,
        preventDefault() {},
        ...payload,
      });
    });
  }
}

const createFakeDocument = () => {
  const store = new Map();
  const menu = new FakeElement('nav', 'sideMenu');
  menu.classList.add('side-menu');
  const hamburger = new FakeElement('button', 'hamburgerBtn');
  const close = new FakeElement('button', 'closeMenuBtn');
  const metronome = new FakeElement('main', 'metronomeView');
  const plans = new FakeElement('main', 'practicePlansView');
  const session = new FakeElement('section', 'sessionProgressCard');
  const grid = new FakeElement('div');
  grid.classList.add('grid');
  const navLinkMet = new FakeElement('a');
  navLinkMet.dataset.route = 'metronome';
  navLinkMet.classList.add('side-menu-link');
  const navLinkPlans = new FakeElement('a');
  navLinkPlans.dataset.route = 'practicePlans';
  navLinkPlans.classList.add('side-menu-link');

  const sectionsRoot = new FakeElement('div');
  sectionsRoot.replaceChildren = (...nodes) => {
    FakeElement.prototype.replaceChildren.call(sectionsRoot, ...nodes);
  };

  store.set('sideMenu', menu);
  store.set('hamburgerBtn', hamburger);
  store.set('closeMenuBtn', close);
  store.set('metronomeView', metronome);
  store.set('practicePlansView', plans);
  store.set('sessionProgressCard', session);

  const body = new FakeElement('body');

  const document = {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => store.get(id) || null,
    querySelector: (selector) => {
      if (selector === '.grid') return grid;
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.side-menu a[data-route]') return [navLinkMet, navLinkPlans];
      return [];
    },
  };

  return {
    document,
    menu,
    hamburger,
    close,
    body,
    navLinkMet,
    navLinkPlans,
    plansView: plans,
    metronomeView: metronome,
  };
};

const createStubStateModule = () => {
  const st = {
    bpm: 120,
    beatUnit: 4,
    beatsPerBar: 4,
    leds: [],
    midi: { instrument: 'synth', enabled: false },
  };
  const setTempo = (bpm) => {
    st.bpm = bpm;
  };
  const resetCounters = () => {
    st.nextNoteTime = 0;
  };
  return { st, setTempo, resetCounters };
};

const createStubAudioModule = () => ({
  initAudio: () => {},
  scheduleClick: () => {},
  setMidiTrack: () => {},
  clearMidi: () => {},
  setMidiEnabled: (st, value) => { st.midi.enabled = value; },
  setMidiVolume: () => {},
  resetMidiPlayback: () => {},
  reanchorMidiPlayback: () => {},
  scheduleBeatMidi: () => [],
  stopMidi: () => {},
  teardownMidiNodes: () => {},
  preloadSoundfontInstrument: () => {},
});

const createStubSpeedModule = () => ({
  considerStep: () => {},
});

const createStubUiModule = () => ({
  bindUI: () => ({
    syncTempoUI: () => {},
    syncStepUI: () => {},
    renderArmState: () => {},
    updateDrillEstimate: () => {},
    syncMidiLibrary: () => {},
    renderMidiStatus: () => {},
    syncMidiControls: () => {},
    syncMidiInstrument: () => {},
    onBeat: () => {},
    onKPIs: () => {},
  }),
});

const createStubPracticeModules = () => ({
  practicePlansMod: {
    loadPlans: () => Promise.resolve([]),
    exportCurrentPlan: () => {},
    saveUserPlan: () => {},
    deleteUserPlan: () => {},
  },
  practicePlansViewMod: {
    createPracticePlansView: () => ({
      setPlans: () => {},
      selectPlan: () => {},
    }),
  },
  practiceQueueMod: {
    createPracticeQueue: () => ({
      loadPlan: () => {},
      getProgress: () => null,
      completeActive: () => {},
      skipActive: () => {},
      goTo: () => {},
      reset: () => {},
    }),
  },
  practiceSessionViewMod: {
    createPracticeSessionView: () => ({
      render: () => {},
      setIdle: () => {},
    }),
  },
});


class StubLocalStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

const stubWindow = (document) => ({
  document,
  localStorage: new StubLocalStorage(),
});

test('hamburger toggles menu open state through router and controller', async () => {
  const { document, menu, hamburger, close, body } = createFakeDocument();
  globalThis.document = document;
  globalThis.window = stubWindow(document);
  globalThis.fetch = () => Promise.reject(new Error('no fetch in test'));

  await import('../app/main.js');
  const createApp = globalThis.__createAppForTest;

  const stateMod = createStubStateModule();
  const audioMod = createStubAudioModule();
  const speedMod = createStubSpeedModule();
  const uiMod = createStubUiModule();
  const {
    practicePlansMod,
    practicePlansViewMod,
    practiceQueueMod,
    practiceSessionViewMod,
  } = createStubPracticeModules();
  const routerMod = { createRouter: (await import('../app/router.js')).createRouter };
  const menuControllerMod = {
    attachMenuController: (await import('../app/menuController.js')).attachMenuController,
  };

  createApp({
    stateMod,
    audioMod,
    speedMod,
    uiMod,
    routerMod,
    practicePlansMod,
    practicePlansViewMod,
    practiceQueueMod,
    practiceSessionViewMod,
    menuControllerMod,
  });

  assert.equal(menu.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-hidden'), 'true');
  assert.equal(body.classList.contains('menu-open'), false);

  hamburger.dispatchEvent('click');

  assert.equal(menu.classList.contains('open'), true);
  assert.equal(menu.getAttribute('aria-hidden'), 'false');
  assert.equal(body.classList.contains('menu-open'), true);

  close.dispatchEvent('click');

  assert.equal(menu.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-hidden'), 'true');
  assert.equal(body.classList.contains('menu-open'), false);

  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.fetch;
});
