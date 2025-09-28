const DEFAULT_ROUTE = 'metronome';
const STORAGE_KEY = 'router:lastRoute';

export function createRouter({ storage } = {}) {
  const views = new Map();
  let current = null;
  let menuOpen = false;
  let menuListeners = [];

  const persist = (route) => {
    try {
      storage?.setItem(STORAGE_KEY, route);
    } catch (_) {}
  };

  const readPersisted = () => {
    if (!storage) return null;
    try {
      return storage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  };

  const hideCurrent = () => {
    if (!current) return;
    const view = views.get(current);
    view?.hide?.();
  };

  const showRoute = (route) => {
    const view = views.get(route);
    if (!view) return false;
    view.show?.();
    current = route;
    persist(route);
    return true;
  };

  return {
    registerView(route, view) {
      views.set(route, view);
    },
    init() {
      const preferred = readPersisted();
      if (preferred && showRoute(preferred)) return preferred;
      showRoute(DEFAULT_ROUTE);
      return current;
    },
    navigate(route) {
      if (!views.has(route)) return false;
      if (current === route) return true;
      hideCurrent();
      return showRoute(route);
    },
    currentRoute() {
      return current;
    },
    setMenuOpen(open) {
      if (menuOpen === open) return;
      menuOpen = !!open;
      menuListeners.forEach((fn) => {
        try {
          fn(menuOpen);
        } catch (_) {}
      });
    },
    toggleMenu() {
      this.setMenuOpen(!menuOpen);
    },
    isMenuOpen() {
      return menuOpen;
    },
    onMenuToggle(fn) {
      if (typeof fn === 'function') menuListeners.push(fn);
    },
  };
}
