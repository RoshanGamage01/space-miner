# SPACE MINER: Beyond the Silence

A first/third-person space exploration game for desktop, built with Godot 4.
You crash on an alien world, mine it on foot, repair your ship, fly to orbit,
dock at stations, trade between three machine kingdoms, fight rogue machines
and pirates, and warp across an endless galaxy to decide the fate of the
Ancient Gate.

## Run it on macOS

1. Download **Godot 4.5** (standard build) from <https://godotengine.org/download/macos/> and open it.
2. Click **Import**, choose this folder's `project.godot`, then **Import & Edit**.
   The first import takes a few minutes while textures are processed.
3. Press **Play** (▶, or Cmd+B).

To make a standalone `SpaceMiner.app`: in Godot choose **Project → Export…**,
let it download the export templates when asked, pick the included **macOS**
preset and click **Export Project**. The same project also runs on Windows and
Linux.

An Apple Silicon Mac or a Mac with a dedicated GPU is recommended. If it runs
slowly, press **Esc → Settings** and lower **Graphics**.

## Controls

| On foot | |
|---|---|
| WASD, mouse | move, look |
| Space | jump; hold in the air for jetpack |
| Shift | run |
| Left mouse | mine (Mining Beam) or fire (Bolt Caster) |
| Q | switch tool |
| E | interact, talk, board ship |
| V | first / third person |
| H | use Med Gel |
| Tab, J | inventory and crafting, journal |

| In the ship | |
|---|---|
| W / S | throttle up / down (W lifts off when landed) |
| Mouse | steer |
| A / D | roll |
| Shift | boost |
| Left mouse | cannons |
| G | land |
| X | cut throttle |
| M | galaxy map (warp from space) |
| E | leave ship when landed, station services when docked |

Climb above about 3,400 m to leave a planet; fly at a planet in space to land
on it; fly into a station's lit bay to dock.

## What is in the game

- **Planets you walk on:** endless terrain with scanned ground, rock, sand and
  snow materials, seas and lava, forests of generated trees, wind-blown grass,
  boulders, mineral deposits, day and night, and six world types.
- **Mining and crafting:** cut boulders for ferrite and trees for carbon, break
  crystal deposits for copper, gold and aetherium, craft warp cells and med gel.
- **Flight:** take off, fly over the landscape, reach space, dock at ring
  stations, fight pirates, and warp between star systems.
- **An endless galaxy:** every system and planet is generated from its
  coordinates, with four authored systems for the story.
- **Three kingdoms:** Thalori, Grumm and Vesh settlements with traders,
  engineers, contract boards and townsfolk; prices reward trade routes.
- **Combat:** rogue machines, Builder sentinels, pirates, and the Warden.
- **Story:** six chapters and two endings, then free play.
- **Progression:** eight upgrade tracks, suit colours and ship paints.

## Graphics

Rendered with Godot's Forward+ renderer (Metal on macOS): physically based
materials from photo scans, real-time global illumination (SDFGI), volumetric
fog and light shafts, cascaded soft shadows, screen-space ambient occlusion and
reflections, bloom, AgX tone mapping, a custom atmosphere-and-cloud sky, and
refractive water. It does not use hardware ray tracing.

Landing and leaving a planet pass through a short fade rather than one
continuous descent, and planets are flat endless terrain rather than spheres
once you are on them.

## Project layout

```
src/        game code (GDScript)
shaders/    terrain, sky, water, foliage, planet and portal shaders
assets/     textures, models, audio
tools/      test scripts and the foliage texture builder
web/        the earlier browser versions of the game
```

## Credits and licences

- Terrain, rock, plant and prop scans and textures: [Poly Haven](https://polyhaven.com), CC0.
- Robot characters, enemy machine, sound effects and music: the Godot
  [Third Person Shooter demo](https://github.com/godotengine/tps-demo), assets
  © 2018 Juan Linietsky and Fernando Miguel Calabró, music © 2018 Christian
  Fernando Perucchi, CC-BY 3.0.
- Engine: [Godot Engine](https://godotengine.org), MIT.
