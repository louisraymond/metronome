import assert from 'node:assert/strict';
import { attachMenuController } from '../app/menuController.js';

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
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.eventListeners = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const list = this.eventListeners.get(type) || [];
    list.push(handler);
    this.eventListeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.eventListeners.get(type);
    if (!list) return;
    const next = list.filter((entry) => entry !== handler);
    this.eventListeners.set(type, next);
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

test('router-driven menu toggles classes and aria state', () => {
  let menuOpen = false;
  const menuListeners = [];
  const router = {
    toggleMenu() {
      this.setMenuOpen(!menuOpen);
    },
    setMenuOpen(open) {
      if (menuOpen === !!open) return;
      menuOpen = !!open;
      menuListeners.forEach((fn) => fn(menuOpen));
    },
    isMenuOpen() {
      return menuOpen;
    },
    onMenuToggle(fn) {
      menuListeners.push(fn);
    },
  };

  const menu = new FakeElement('nav');
  const hamburger = new FakeElement('button');
  const close = new FakeElement('button');
  const body = new FakeElement('body');
  const document = { body };

  const controller = attachMenuController({
    router,
    menuEl: menu,
    hamburgerEl: hamburger,
    closeEl: close,
    document,
  });

  assert.equal(menu.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-hidden'), 'true');
  assert.equal(hamburger.getAttribute('aria-expanded'), 'false');
  assert.equal(body.classList.contains('menu-open'), false);

  hamburger.dispatchEvent('click');
  assert.equal(menu.classList.contains('open'), true);
  assert.equal(menu.getAttribute('aria-hidden'), 'false');
  assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
  assert.equal(body.classList.contains('menu-open'), true);
  assert.equal(controller.isOpen(), true);

  close.dispatchEvent('click');
  assert.equal(menu.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-hidden'), 'true');
  assert.equal(body.classList.contains('menu-open'), false);
  assert.equal(controller.isOpen(), false);
});

test('menu falls back to manual toggling when router not provided', () => {
  const menu = new FakeElement('nav');
  const hamburger = new FakeElement('button');
  const close = new FakeElement('button');
  const body = new FakeElement('body');
  const document = { body };

  const controller = attachMenuController({
    menuEl: menu,
    hamburgerEl: hamburger,
    closeEl: close,
    document,
  });

  assert.ok(controller);
  assert.equal(menu.classList.contains('open'), false);

  hamburger.dispatchEvent('click');
  assert.equal(menu.classList.contains('open'), true);
  assert.equal(hamburger.getAttribute('aria-expanded'), 'true');
  assert.equal(body.classList.contains('menu-open'), true);
  assert.equal(controller.isOpen(), true);

  controller.close();
  assert.equal(menu.classList.contains('open'), false);
  assert.equal(body.classList.contains('menu-open'), false);
});
