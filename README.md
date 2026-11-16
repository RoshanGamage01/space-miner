# SPACE MINER

*Mine. Fight. Upgrade.* A pixel-art space mining and combat game for short
breaks. Plain ES modules, no build step, no dependencies.

![Top view](docs/screenshot.png)
![Cockpit view](docs/cockpit.png)

```bash
npm start        # then open http://localhost:5173/
npm test         # headless simulation tests
```

## How it plays

Mine asteroids, scoop up the ore, dock to sell, upgrade, and fight off the
aliens that keep coming for you.

| Control | Action |
| --- | --- |
| `W A S D` | Fly (`Shift` boost) |
| Mouse + **left click** | Mining laser |
| **Right click** / `F` | Fire weapon |
| `1`–`4` / `Q` | Switch weapon |
| `Space` | Shockwave: hits everything nearby, wipes enemy shots |
| `E` | Dock (sells your hold and repairs for free) / salvage |
| `V` | Toggle **cockpit view** |
| `H` `M` `G` | Hangar, Market, Galaxy |

**Cockpit view** puts you inside the ship: `W`/`S` thrust, `A`/`D` turn, click
to capture the mouse and steer by looking around. Enemies get target brackets,
and the dashboard shows hull, shields, a forward radar and your weapon.

## What's in it

- **Combat**: alien patrols every ~30–50s (swarmers that ram, spitters that
  shoot, armored brutes), 3-wave **invasions**, a **mothership boss** that
  fires bullet rings and launches swarmers, and cargo-stealing pirates. Quick
  kills build a **combo** (up to x3 credits). The station turret covers you
  near home.
- **Weapons**: Blaster, Scatter, homing Missiles, piercing Railgun. Each one
  upgrades to level 6. Shots also chip asteroids.
- **Ship**: six upgrades (Laser, Engines, Armor, Shields, Cargo, Drone Tech)
  and four hulls with bigger guns and holds.
- **Drones** mine on their own and fill the station silo, even while you're
  away (up to 3 hours).
- **Four sectors**, each richer and more dangerous than the last.
- One mission at a time, achievements, random events (meteors, crystal
  motherlodes, derelicts, power surges).
- Autosave to `localStorage`, synthesized sound, works on phones (touch flies
  toward your finger and auto-targets).

## Code layout

```
src/
  main.js               bootstraps everything: loop, autosave, offline progress
  core/                 config (all balance numbers), state, math
  engine/               GameEngine (fixed-order step), GameLoop, input, camera
  systems/              pure simulation, no DOM: Player, Mining, Combat,
                        Asteroids, Resources, Drones, Economy, Upgrades,
                        Missions, Achievements, Events, Save
  render/               Renderer (top view), CockpitRenderer (first person),
                        procedural pixel-art sprites, backdrop, particles
  ui/                   UIManager (HUD + screens), audio, radar, icons
tests/                  node:test suite and a bot that plays the game
```
