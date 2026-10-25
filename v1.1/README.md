# Rug Rush

First-person browser game about running a rug cleaning warehouse. Trucks back up to the side door with rolled rugs, you
unload them, read the care label, pile powders, gels and foam on them, scrub, rinse with the hanging hose, squeegee the
water into the drain, dry them, feed them to the rolling machine and load the wrapped rolls onto the pickup truck.

- three.js 0.170 + Rapier 0.14 (ES modules from jsDelivr, no build step)
- Phase 1: baseplate with all mechanics. Phase 2: warehouse, real product models, co-op for 1-4 players.

## Run locally

```
python3 Niepotrzebne/tools/serve.py 8960
```

Open http://localhost:8960.

## Controls

WASD move · Shift sprint · Space jump · C crouch · E pick up / use / read label · LMB use held item · RMB item mode ·
Q drop · F throw · mouse wheel carry distance · hold R and walk to roll up a rug.

## Credits

Textures and HDRIs: ambientCG and Poly Haven (CC0), see `assets/CREDITS.md`. Sounds: Freesound (CC0), see `assets/audio/*/CREDITS.md`. Radio music: "Funky Chunk", "Local Forecast", "Funkorama", "On Hold for You" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/ Cleaning facts: `research/cleaning-facts.md`.
