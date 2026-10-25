// Rug Rush menus: title, solo/host/join flow, public room list, settings, character creator hookup and pause screen in friendslop style.
import { installTheme, el, logo, button } from './theme.js';
import { Creator } from './creator.js';
import { loadLook } from '../player/avatar.js';
import { saveSettings, applySettings } from '../game/settings.js';

export class Menu {
  constructor(game) {
    installTheme();
    this.game = game;
    this.layer = null;
    this.unsub = null;
    this.sfx = (n) => game.audio?.ui?.(n);
  }

  get open() {
    return !!this.layer;
  }

  mount(node) {
    this.hide();
    this.layer = node;
    document.body.append(node);
    this.sfx('ui_whoosh');
  }

  hide() {
    this.unsub?.();
    this.unsub = null;
    this.layer?.remove();
    this.layer = null;
  }

  title() {
    const g = this.game;
    const look = loadLook();
    const scr = el('div', { class: 'rr-screen dim rr-ui', style: 'flex-direction:column' });
    scr.append(logo('RUG RUSH'), el('div', { class: 'rr-tag' }, 'Unload the trucks. Clean the rugs. Don’t ruin the silk.'));
    const col = el('div', { class: 'rr-col', style: 'align-items:center;gap:16px' });
    col.append(
      button('Play solo', { cls: 'green big', sfx: this.sfx, onClick: () => g.startSolo() }),
      el('div', { class: 'rr-row', style: 'justify-content:center' },
        button('Host co-op', { cls: 'blue', sfx: this.sfx, onClick: () => this.hostDialog() }),
        button('Join co-op', { cls: 'purple', sfx: this.sfx, onClick: () => this.rooms() }),
      ),
      el('div', { class: 'rr-row', style: 'justify-content:center' },
        button(`\u{1F9E2} ${look.name ?? 'Worker'}`, { cls: 'pink small', sfx: this.sfx, onClick: () => this.character(() => this.title()) }),
        button('Settings', { cls: 'white small', sfx: this.sfx, onClick: () => this.settings(() => this.title()) }),
      ),
    );
    const save = g.save?.peek?.();
    if (save) col.append(el('div', { class: 'rr-sticker', style: 'transform:rotate(1.5deg);margin-top:6px' }, `Day ${save.day} · $${Math.round(save.money)} in the bank`));
    scr.append(col);
    scr.append(el('div', { style: 'position:fixed;bottom:14px;left:16px;color:#fff;font-weight:600;text-shadow:0 2px 0 var(--ink);opacity:.85' }, 'Gzowo Labs · v1.3'));
    this.mount(scr);
  }

  hostDialog() {
    const g = this.game;
    const look = loadLook();
    if (!g.net) return this.message('Co-op is offline', 'Multiplayer is not available in this build yet.', () => this.title());
    const scr = el('div', { class: 'rr-screen dim rr-ui' });
    const input = el('input', { class: 'rr-input', maxlength: '28', value: `${look.name ?? 'Worker'}’s warehouse` });
    const go = button('Open warehouse', { cls: 'green', sfx: this.sfx, onClick: async () => {
      go.disabled = true;
      go.textContent = 'Opening…';
      try {
        await g.startHost(input.value.trim() || 'Rug Rush');
      } catch (e) {
        this.message('Could not host', String(e?.message ?? e), () => this.title());
      }
    } });
    scr.append(el('div', { class: 'rr-panel', style: 'width:min(520px,94vw)' },
      el('h2', {}, 'Host co-op'),
      el('div', { class: 'rr-label' }, 'Warehouse name (everyone can see it in the list)'),
      input,
      el('div', { class: 'rr-row', style: 'margin-top:18px;justify-content:space-between' },
        button('Back', { cls: 'white small', sfx: this.sfx, onClick: () => this.title() }),
        go,
      ),
    ));
    this.mount(scr);
    setTimeout(() => input.select(), 50);
  }

  rooms() {
    const g = this.game;
    if (!g.net) return this.message('Co-op is offline', 'Multiplayer is not available in this build yet.', () => this.title());
    const scr = el('div', { class: 'rr-screen dim rr-ui' });
    const list = el('div', { class: 'rr-col', style: 'min-height:120px' }, el('div', { class: 'rr-row rr-muted' }, el('span', { class: 'rr-spinner' }), 'Looking for open warehouses…'));
    scr.append(el('div', { class: 'rr-panel', style: 'width:min(640px,94vw)' },
      el('h2', {}, 'Join co-op'),
      list,
      el('div', { class: 'rr-row', style: 'margin-top:18px;justify-content:space-between' },
        button('Back', { cls: 'white small', sfx: this.sfx, onClick: () => this.title() }),
        button('Host instead', { cls: 'blue small', sfx: this.sfx, onClick: () => this.hostDialog() }),
      ),
    ));
    this.mount(scr);
    const render = (rooms) => {
      list.innerHTML = '';
      if (!rooms?.length) {
        list.append(el('div', { class: 'rr-card', style: 'justify-content:center;flex-direction:column;padding:22px' },
          el('div', { style: 'font-size:22px;font-weight:700' }, 'No warehouses open'),
          el('div', { class: 'rr-muted' }, 'Host one and tell your friends to look here.')));
        return;
      }
      for (const r of rooms) {
        const full = r.players >= (r.max ?? 4);
        const join = button(full ? 'Full' : 'Join', { cls: full ? 'white small' : 'green small', sfx: this.sfx, onClick: () => this.join(r) });
        join.disabled = full;
        list.append(el('div', { class: 'rr-card' },
          el('div', { class: 'rr-dot', style: `background:${r.color ?? '#3bceac'}` }),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-weight:700;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, r.name ?? 'Warehouse'),
            el('div', { class: 'rr-muted', style: 'font-size:14px' }, `Host: ${r.hostName ?? '?'}`)),
          el('div', { class: 'rr-sticker', style: 'padding:4px 10px;font-size:15px;box-shadow:2px 2px 0 var(--ink)' }, `${r.players}/${r.max ?? 4}`),
          join));
      }
    };
    try {
      this.unsub = g.net.listRooms(render);
    } catch (e) {
      render([]);
    }
  }

  async join(room) {
    const g = this.game;
    this.connecting(`Joining ${room.name ?? 'warehouse'}…`);
    try {
      await g.joinRoom(room.id);
    } catch (e) {
      this.message('Could not join', String(e?.message ?? e), () => this.rooms());
    }
  }

  connecting(text) {
    const scr = el('div', { class: 'rr-screen dim rr-ui' },
      el('div', { class: 'rr-panel', style: 'display:flex;align-items:center;gap:14px;font-size:20px;font-weight:600' }, el('span', { class: 'rr-spinner' }), text));
    this.mount(scr);
  }

  message(title, text, back) {
    const scr = el('div', { class: 'rr-screen dim rr-ui' },
      el('div', { class: 'rr-panel', style: 'width:min(520px,94vw)' },
        el('h2', {}, title),
        el('p', { style: 'font-size:18px;font-weight:500;margin:6px 0 18px' }, text),
        button('OK', { cls: 'yellow', sfx: this.sfx, onClick: () => back?.() })));
    this.mount(scr);
    this.sfx('ui_error');
  }

  character(back) {
    this.hide();
    new Creator({
      look: loadLook(),
      sfx: this.sfx,
      onDone: (look) => {
        this.game.onLookChanged?.(look);
        back?.();
      },
    });
  }

  settings(back) {
    const g = this.game;
    const s = g.settings;
    const scr = el('div', { class: 'rr-screen dim rr-ui' });
    const commit = () => {
      saveSettings(s);
      applySettings(g, s);
    };
    const slider = (key, label, min, max, step, fmt) => {
      const val = el('span', { class: 'rr-sticker', style: 'padding:2px 10px;font-size:14px;box-shadow:2px 2px 0 var(--ink);min-width:48px;text-align:center' }, fmt(s[key]));
      const r = el('input', { class: 'rr-range', type: 'range', min, max, step, value: s[key] });
      r.addEventListener('input', () => {
        s[key] = +r.value;
        val.textContent = fmt(s[key]);
        commit();
      });
      r.addEventListener('change', () => this.sfx('ui_slider'));
      return el('div', {}, el('div', { class: 'rr-row', style: 'justify-content:space-between' }, el('div', { class: 'rr-label' }, label), val), r);
    };
    const toggle = (key, label) => {
      const t = el('div', { class: `rr-toggle ${s[key] ? 'on' : ''}` });
      t.addEventListener('click', () => {
        s[key] = !s[key];
        t.classList.toggle('on', s[key]);
        this.sfx('ui_pop');
        commit();
      });
      return el('div', { class: 'rr-row', style: 'justify-content:space-between;margin:8px 0' }, el('div', { style: 'font-weight:600;font-size:17px' }, label), t);
    };
    const quality = el('div', { class: 'rr-row', style: 'gap:8px' });
    for (const q of ['low', 'medium', 'high']) {
      const c = el('button', { class: `rr-chip ${s.quality === q ? 'on' : ''}` }, q[0].toUpperCase() + q.slice(1));
      c.addEventListener('click', () => {
        s.quality = q;
        [...quality.children].forEach((k) => k.classList.toggle('on', k === c));
        this.sfx('ui_pop');
        commit();
      });
      quality.append(c);
    }
    const pct = (v) => `${Math.round(v * 100)}%`;
    scr.append(el('div', { class: 'rr-panel', style: 'width:min(560px,94vw)' },
      el('h2', {}, 'Settings'),
      slider('sensitivity', 'Mouse sensitivity', 0.3, 2.5, 0.05, (v) => v.toFixed(2)),
      slider('fov', 'Field of view', 60, 95, 1, (v) => `${v}°`),
      toggle('invertY', 'Invert mouse Y'),
      el('div', { class: 'rr-label' }, 'Graphics'),
      quality,
      slider('master', 'Master volume', 0, 1, 0.01, pct),
      slider('sfx', 'Effects', 0, 1, 0.01, pct),
      slider('music', 'Music', 0, 1, 0.01, pct),
      toggle('radio', 'Warehouse radio'),
      toggle('tags', 'Name tags above players'),
      el('div', { class: 'rr-row', style: 'margin-top:16px;justify-content:space-between;align-items:flex-end' },
        el('div', { class: 'rr-muted', style: 'font-size:12px;max-width:330px;font-weight:500' }, 'Radio music by Kevin MacLeod (incompetech.com), CC BY 4.0. Sounds from Freesound (CC0). Textures from ambientCG and Poly Haven (CC0).'),
        button('Done', { cls: 'pink', sfx: this.sfx, onClick: () => back?.() })),
    ));
    this.mount(scr);
  }

  pause() {
    const g = this.game;
    if (g.mode === 'solo') g.engine.paused = true;
    const scr = el('div', { class: 'rr-screen dim rr-ui', style: 'flex-direction:column' });
    const who = g.mode === 'host' ? `Hosting · ${1 + (g.net?.peers?.length ?? 0)} in the warehouse` : g.mode === 'client' ? 'Connected to a co-op warehouse' : 'Solo';
    scr.append(el('div', { class: 'rr-panel', style: 'width:min(460px,94vw);display:flex;flex-direction:column;align-items:center;gap:14px' },
      el('h2', {}, 'Paused'),
      el('div', { class: 'rr-muted', style: 'font-weight:600;margin-bottom:6px' }, who),
      button('Resume', { cls: 'green big', sfx: this.sfx, onClick: () => g.resume() }),
      el('div', { class: 'rr-row', style: 'justify-content:center' },
        button('Character', { cls: 'pink small', sfx: this.sfx, onClick: () => this.character(() => this.pause()) }),
        button('Settings', { cls: 'white small', sfx: this.sfx, onClick: () => this.settings(() => this.pause()) }),
      ),
      button(g.mode === 'solo' ? 'Save & quit' : 'Leave', { cls: 'orange small', sfx: this.sfx, onClick: () => g.leaveToMenu() }),
    ));
    this.mount(scr);
  }
}
