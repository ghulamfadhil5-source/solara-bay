// Solara Bay — keyboard and mouse input.
// One clear job: track which keys are held and where the mouse is, and let
// the game ask about them without touching the DOM itself.

import { G } from './state.js';

const KEY_ALIASES = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'interact',
  Space: 'jump',
  Escape: 'pause',
  KeyP: 'pause',
};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const action = KEY_ALIASES[e.code];
    if (action) {
      G.keys[action] = true;
      if (action === 'pause') G.keys.pausePressed = true;
      if (action === 'interact') G.keys.interactPressed = true;
      if (['up', 'down', 'left', 'right', 'jump'].includes(action)) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const action = KEY_ALIASES[e.code];
    if (action) G.keys[action] = false;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouseDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) G.mouseDown = false;
  });
  window.addEventListener('blur', () => {
    G.keys = {};
    G.mouseDown = false;
  });
}

// Consume a one-shot press so it fires exactly once.
export function consumePress(name) {
  if (G.keys[name]) {
    G.keys[name] = false;
    return true;
  }
  return false;
}
