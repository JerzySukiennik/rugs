// Rug Rush entity registry: stable numeric ids and kind lookup so state can be serialized and later networked.
export class Entities {
  constructor() {
    this.nextId = 1;
    this.map = new Map();
  }

  add(ent, id = null) {
    ent.id = id ?? this.nextId++;
    if (ent.id >= this.nextId) this.nextId = ent.id + 1;
    this.map.set(ent.id, ent);
    return ent;
  }

  remove(ent) {
    this.map.delete(ent.id);
    ent.dispose?.();
  }

  get(id) {
    return this.map.get(id) ?? null;
  }

  *ofKind(kind) {
    for (const e of this.map.values()) if (e.kind === kind) yield e;
  }

  list(kind) {
    return [...this.ofKind(kind)];
  }

  serialize() {
    const out = [];
    for (const e of this.map.values()) if (e.serialize) out.push({ id: e.id, kind: e.kind, ...e.serialize() });
    return out;
  }
}
