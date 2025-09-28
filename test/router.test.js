import assert from 'node:assert/strict';

const createViewSpy = () => {
  let showCount = 0;
  let hideCount = 0;
  return {
    show: () => {
      showCount += 1;
    },
    hide: () => {
      hideCount += 1;
    },
    get showCount() {
      return showCount;
    },
    get hideCount() {
      return hideCount;
    },
  };
};

const createMemoryStorage = () => {
  const bag = new Map();
  return {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => {
      bag.set(key, String(value));
    },
    removeItem: (key) => {
      bag.delete(key);
    },
    bag,
  };
};

test('router navigates between registered views', async () => {
  const storage = createMemoryStorage();
  const { createRouter } = await import('../app/router.js');
  const router = createRouter({ storage });

  const met = createViewSpy();
  const plans = createViewSpy();

  router.registerView('metronome', met);
  router.registerView('practicePlans', plans);

  router.navigate('metronome');
  assert.equal(router.currentRoute(), 'metronome');
  assert.equal(met.showCount, 1);
  assert.equal(met.hideCount, 0);

  router.navigate('practicePlans');
  assert.equal(router.currentRoute(), 'practicePlans');
  assert.equal(met.hideCount, 1);
  assert.equal(plans.showCount, 1);
});

test('router persists last route to storage', async () => {
  const storage = createMemoryStorage();
  const { createRouter } = await import('../app/router.js');

  // First instance saves route
  let router = createRouter({ storage });
  const met = createViewSpy();
  const plans = createViewSpy();
  router.registerView('metronome', met);
  router.registerView('practicePlans', plans);
  router.navigate('practicePlans');
  assert.equal(storage.getItem('router:lastRoute'), 'practicePlans');

  // Second instance should initialise with saved route
  router = createRouter({ storage });
  const met2 = createViewSpy();
  const plans2 = createViewSpy();
  router.registerView('metronome', met2);
  router.registerView('practicePlans', plans2);
  router.init();
  assert.equal(router.currentRoute(), 'practicePlans');
  assert.equal(plans2.showCount > 0, true);
});

test('router toggles menu state', async () => {
  const storage = createMemoryStorage();
  const { createRouter } = await import('../app/router.js');
  const router = createRouter({ storage });

  let menuStates = [];
  router.onMenuToggle((open) => {
    menuStates.push(open);
  });

  router.setMenuOpen(true);
  router.toggleMenu();
  router.toggleMenu();

  assert.deepEqual(menuStates, [true, false, true]);
  assert.equal(router.isMenuOpen(), true);
});
