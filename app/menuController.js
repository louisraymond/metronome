export function attachMenuController({
  router,
  menuEl,
  hamburgerEl,
  closeEl,
  document,
} = {}) {
  if (!menuEl || !hamburgerEl) {
    return null;
  }

  const doc = document || (typeof window !== 'undefined' ? window.document : undefined);
  const body = doc?.body || null;
  const listeners = [];
  let manualState = false;
  let destroyed = false;

  const applyState = (open) => {
    if (!menuEl) return;
    const active = !!open;
    menuEl.classList.toggle('open', active);
    menuEl.setAttribute('aria-hidden', active ? 'false' : 'true');
    hamburgerEl?.setAttribute('aria-expanded', active ? 'true' : 'false');
    if (body) body.classList.toggle('menu-open', active);
  };

  const subscribe = (element, type, handler) => {
    if (!element || typeof element.addEventListener !== 'function') return;
    element.addEventListener(type, handler);
    listeners.push([element, type, handler]);
  };

  const unsubscribeAll = () => {
    listeners.forEach(([el, type, handler]) => {
      if (typeof el?.removeEventListener === 'function') {
        el.removeEventListener(type, handler);
      }
    });
    listeners.length = 0;
  };

  const setOpenManual = (open) => {
    manualState = !!open;
    applyState(manualState);
  };

  const getManualState = () => manualState;

  const getRouterState = () => {
    if (!router) return manualState;
    try {
      return !!router.isMenuOpen?.();
    } catch (_) {
      return false;
    }
  };

  const setRouterState = (open) => {
    if (!router) {
      setOpenManual(open);
      return;
    }
    try {
      router.setMenuOpen?.(!!open);
    } catch (_) {
      // fall back to manual toggling when router refuses state changes
      setOpenManual(open);
    }
  };

  if (router && typeof router.onMenuToggle === 'function') {
    router.onMenuToggle((open) => {
      if (destroyed) return;
      applyState(open);
    });
  }

  if (router) {
    subscribe(hamburgerEl, 'click', () => {
      try {
        router.toggleMenu?.();
      } catch (_) {
        setOpenManual(!getManualState());
      }
    });
    subscribe(closeEl, 'click', () => {
      setRouterState(false);
    });
  } else {
    subscribe(hamburgerEl, 'click', () => {
      setOpenManual(!getManualState());
    });
    subscribe(closeEl, 'click', () => setOpenManual(false));
  }

  applyState(getRouterState());

  return {
    open: () => setRouterState(true),
    close: () => setRouterState(false),
    toggle: () => setRouterState(!getRouterState()),
    isOpen: () => getRouterState(),
    destroy: () => {
      destroyed = true;
      unsubscribeAll();
      body?.classList?.remove('menu-open');
      menuEl?.classList?.remove('open');
      menuEl?.setAttribute('aria-hidden', 'true');
      hamburgerEl?.setAttribute('aria-expanded', 'false');
    },
  };
}
