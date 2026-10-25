// Rug Rush settings: persisted player preferences (mouse, view, quality, volumes) and applying them to the running game.
const KEY = 'rugrush.settings';

export const DEFAULTS = {
  sensitivity: 1,
  invertY: false,
  fov: 72,
  quality: 'high',
  master: 0.9,
  sfx: 0.9,
  music: 0.55,
  radio: true,
  tags: true,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...DEFAULTS, ...s };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}

export function applySettings(game, s) {
  const { engine, input } = game;
  input.sensitivity = 0.0022 * s.sensitivity;
  input.invertY = !!s.invertY;
  engine.camera.fov = s.fov;
  engine.camera.updateProjectionMatrix();
  const q = s.quality;
  const pr = q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.5);
  if (engine.renderer.getPixelRatio() !== pr) {
    engine.renderer.setPixelRatio(pr);
    engine.onResize();
  }
  engine.renderer.shadowMap.enabled = q !== 'low';
  game.fluids?.setReflections?.(q === 'high');
  if (game.carpets?.quality) game.carpets.quality.shells = q === 'low' ? 0.5 : 1;
  game.audio?.setVolumes?.({ master: s.master, sfx: s.sfx, music: s.music, radio: s.radio });
  game.showTags = s.tags;
}
