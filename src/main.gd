extends Node3D
## Game shell: owns the current world (planet surface or space), the HUD and
## menus, and routes input and story events between them.

var world: Node3D
var hud: Hud
var menus # Menus
var audio # Sfx
var ship: Ship
var mode := "foot" # foot or ship
var started := false
var busy := false # true during transitions
var args := {}
var save_t := 0.0
var story_t := 0.0
var test_mode := false
var warden: Actor
static var skip_title := false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	test_mode = args.has("script")
	_inputs()
	process_mode = Node.PROCESS_MODE_ALWAYS
	hud = Hud.new(self); add_child(hud)
	menus = Menus.new(self); add_child(menus)
	if ResourceLoader.exists("res://src/sfx.gd"):
		audio = load("res://src/sfx.gd").new(); add_child(audio)
	Game.quest_event.connect(_on_quest_event)
	if args.has("q"): Game.s.settings.quality = int(args.q)
	apply_quality()
	if test_mode:
		if not args.has("keep"): Game.s = Game.new_game()
		if args.has("q"): Game.s.settings.quality = int(args.q)
		await begin(false)
		var sc = load(args.script).new()
		await sc.run(self)
		get_tree().quit()
	else:
		var has := Game.load_save()
		if skip_title: skip_title = false; await begin(false)
		else:
			await begin(has, true)
			menus.title()

func _inputs() -> void:
	var keys := {"fwd": [KEY_W, KEY_UP], "back": [KEY_S, KEY_DOWN], "left": [KEY_A, KEY_LEFT], "right": [KEY_D, KEY_RIGHT], "jump": [KEY_SPACE], "run": [KEY_SHIFT],
		"interact": [KEY_E], "tool": [KEY_Q], "view": [KEY_V], "land": [KEY_G], "brake": [KEY_X], "heal": [KEY_H], "inventory": [KEY_TAB, KEY_I], "journal": [KEY_J], "map": [KEY_M], "pause": [KEY_ESCAPE, KEY_P], "scan": [KEY_F]}
	for a in keys:
		if not InputMap.has_action(a): InputMap.add_action(a)
		for k in keys[a]:
			var e := InputEventKey.new(); e.physical_keycode = k; InputMap.action_add_event(a, e)
	if not InputMap.has_action("fire"): InputMap.add_action("fire")
	var mb := InputEventMouseButton.new(); mb.button_index = MOUSE_BUTTON_LEFT; InputMap.action_add_event("fire", mb)

func playing() -> bool:
	return started and not busy and not get_tree().paused and not in_panel()
func in_panel() -> bool:
	return menus != null and menus.open != ""

func sfx(name: String, db := 0.0) -> void:
	if audio: audio.play(name, db)
func loop_sfx(name: String, on: bool, pitch := 1.0) -> void:
	if audio: audio.loop(name, on, pitch)

# ---------------------------------------------------------------- worlds
func begin(from_save: bool, with_title := false) -> void:
	busy = true
	hud.fade.color.a = 1.0
	var sys := Universe.system(Game.s.system)
	if Game.s.in_space and from_save: await _load_space(sys, Game.s.planet, Game.s.docked)
	else: await _load_surface(sys, sys.planets[clampi(Game.s.planet, 0, sys.planets.size() - 1)], false)
	started = true; busy = false
	if with_title:
		hud.fade.color.a = 0.0
		return
	capture(true)
	await hud.fade_to(0.0, 1.2)
	on_title_closed()

func on_title_closed() -> void:
	if Game.s.quest.q == 0 and Game.s.quest.s == 0:
		hud.banner("Verdis", "Haven's Reach system")
		Game.toast.emit("IRIS: Pilot, you are alive. The ship is not. Your multi-tool still works: mine Ferrite from boulders.", "info")

func _clear_world() -> void:
	if world:
		if world is SurfaceWorld: world.save_state()
		world.queue_free(); world = null; ship = null
		await get_tree().process_frame

func _load_surface(sys: Dictionary, planet: Dictionary, from_space: bool) -> void:
	await _clear_world()
	Game.s.system = sys.id; Game.s.planet = planet.index; Game.s.in_space = false; Game.s.docked = false
	Game.s.stats.worlds["%s:%d" % [sys.id, planet.index]] = true
	var w := SurfaceWorld.new(self, sys, planet)
	add_child(w); world = w; ship = w.ship
	var crash: Dictionary = w.site_of("crash")
	var first: Dictionary = w.sites[0] if not w.sites.is_empty() else {}
	if from_space:
		# Arrive high above the main settlement, nose down.
		var over: Vector3 = first.pos if not first.is_empty() else Vector3.ZERO
		var tgt := Vector3(over.x - 1400.0, 0, over.z - 900.0)
		ship.global_position = Vector3(tgt.x, maxf(w.hf.height(tgt.x, tgt.z), w.hf.sea) + 2300.0, tgt.z)
		ship.look_at(Vector3(over.x, ship.global_position.y - 900.0, over.z), Vector3.UP)
		ship.state = "flying"; ship.throttle = 0.6; ship.vel = ship.forward() * 120.0; ship.piloted = true
		mode = "ship"; w.player.active = false; w.player.visible = false; w.player.tool_node.visible = false
		w.player.global_position = ship.global_position
	else:
		var sp = Game.s.ship_pos; var pp = Game.s.pos
		var base: Vector3 = crash.pos if not crash.is_empty() else (first.pos + Vector3(first.radius + 30.0, 0, 0) if not first.is_empty() else Vector3.ZERO)
		if sp is Array and sp.size() >= 4 and Game.s.flags.has("placed"):
			ship.global_position = Vector3(sp[0], w.hf.height(sp[0], sp[2]) + 1.42, sp[2]); ship.rotation.y = sp[3]
		else:
			ship.global_position = Vector3(base.x, w.hf.height(base.x, base.z) + 1.42, base.z); ship.rotation.y = 0.6
		if pp is Array and pp.size() >= 3 and Game.s.flags.has("placed"):
			w.player.global_position = Vector3(pp[0], w.hf.height(pp[0], pp[2]) + 0.2, pp[2])
		else:
			var at := ship.global_position + Vector3(6.5, 0, 3.0)
			w.player.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.2, at.z)
			w.player.yaw = 2.2
		Game.s.flags["placed"] = true
		mode = "foot"
	w.cam.global_position = (ship.global_position if mode == "ship" else w.player.global_position) + Vector3(0, 2, 0)
	hud.place_name.text = planet.name
	hud.place_sub.text = w.biome.label + ("  ·  " + w.biome.hazard if w.biome.hazard != "" else "")
	for i in 900:
		await get_tree().process_frame
		if i > 20 and not w.loading(): break

func _load_space(sys: Dictionary, planet: int, docked: bool) -> void:
	await _clear_world()
	Game.s.system = sys.id; Game.s.planet = planet; Game.s.in_space = true; Game.s.docked = docked
	var w := SpaceWorld.new(self, sys)
	add_child(w); world = w; ship = w.ship; mode = "ship"; ship.piloted = true
	var pl: Dictionary = sys.planets[clampi(planet, 0, sys.planets.size() - 1)]
	if docked:
		ship.global_position = w.bay + Vector3(0, -2.0, 4.0); ship.rotation = Vector3(0, PI, 0); ship.state = "docked"
	else:
		var out: Vector3 = (sys.station.pos - pl.pos).normalized()
		ship.global_position = pl.pos + out * (pl.radius * 1.32)
		ship.look_at(ship.global_position + out, Vector3.UP)
		ship.state = "flying"; ship.throttle = 0.5; ship.vel = ship.forward() * 200.0
	w.cam.global_transform = ship.global_transform.translated_local(Vector3(0, 3.6, 15.0))
	hud.place_name.text = sys.name
	hud.place_sub.text = sys.star.name + ("  ·  " + Data.FACTIONS[sys.faction].name if sys.get("faction", "") != "" else "")
	for i in 12: await get_tree().process_frame

func to_space() -> void:
	if busy: return
	busy = true
	var sys: Dictionary = world.sys; var idx: int = world.desc.index
	await hud.fade_to(1.0, 0.7)
	await _load_space(sys, idx, false)
	busy = false
	Game.story("space")
	await hud.fade_to(0.0, 1.0)
	hud.banner(sys.name, "Open space", Hud.CYAN)

func to_surface(desc: Dictionary) -> void:
	if busy: return
	busy = true
	sfx("entry")
	await hud.fade_to(1.0, 0.7)
	await _load_surface(world.sys, desc, true)
	busy = false
	await hud.fade_to(0.0, 1.0)
	hud.banner(desc.name, Biomes.TYPES[desc.type].label)

func dock() -> void:
	var w: SpaceWorld = world
	ship.state = "docked"; ship.vel = Vector3.ZERO; ship.throttle = 0.0
	ship.global_position = w.bay + Vector3(0, -2.0, 4.0); ship.rotation = Vector3(0, PI, 0)
	ship.hull = Game.ship_hull()
	Game.s.docked = true
	Game.story("dock")
	sfx("land"); persist()
	menus.station()

func undock() -> void:
	ship.rotation = Vector3(0, PI, 0)
	ship.global_position = world.bay + Vector3(0, 0, 70.0)
	ship.state = "flying"; ship.throttle = 0.3; ship.vel = ship.forward() * 60.0
	Game.s.docked = false; sfx("launch")

func warp(id: String) -> void:
	if busy or not (world is SpaceWorld) or not Game.remove_item("warp_cell", 1): return
	busy = true
	sfx("warp")
	hud.banner("Warp", "Folding space", Hud.CYAN)
	var tw := create_tween(); tw.tween_property(world.cam, "fov", 140.0, 1.4)
	await hud.fade_to(1.0, 1.5)
	Game.s.stats.jumps += 1
	var sys := Universe.system(id)
	await _load_space(sys, 0, false)
	busy = false
	Game.story("system", {"system": id})
	await hud.fade_to(0.0, 1.2)
	hud.banner(sys.name, sys.star.name)
	persist()

func new_game() -> void:
	Game.wipe(); skip_title = true
	get_tree().paused = false
	get_tree().reload_current_scene()

func talk(role: String, after: Callable = Callable()) -> void:
	var who: Dictionary = Data.NPCS[role]
	var d := Game.dialogue_for(role)
	menus.dialogue(who.name, who.title, Data.FACTIONS[who.faction].color, d.lines, func():
		if d.story: Game.story("talk", {"role": role})
		if after.is_valid(): after.call())

func say(name: String, sub: String, lines: Array, color := Color(0.8, 0.9, 1.0)) -> void:
	menus.dialogue(name, sub, color, lines)

func open_shop(tab: String) -> void: menus.shop(tab)

func contracts(faction: String, idx: int, after: Callable = Callable()) -> void:
	var f := faction if faction != "" else "thalori"
	var lines: Array
	if Game.s.bounty != null:
		if Game.bounty_ready():
			var u: int = Game.s.bounty.units
			Game.claim_bounty(); sfx("pickup")
			lines = ["Contract complete. %d units, as agreed." % u]
		else: lines = ["Your contract stands: %s." % Game.s.bounty.text]
	else:
		var rnd := RandomNumberGenerator.new(); rnd.seed = hash([Game.s.system, idx, Game.s.stats.kills, Game.s.stats.mined / 50])
		Game.s.bounty = Game.new_bounty(rnd, f)
		lines = ["New contract: %s. Payment %d units." % [Game.s.bounty.text, Game.s.bounty.units]]
	menus.dialogue("Contract board", Data.FACTIONS[f].name, Data.FACTIONS[f].color, lines, after)

func use_gate() -> void: menus.choice()

func refresh_stats() -> void:
	if ship: ship.hull = Game.ship_hull()

func refresh_style() -> void:
	if world is SurfaceWorld: world.player.set_suit(Game.style_color("suit"))
	if ship: ship.set_paint(Game.style_color("paint"))

## Render scale and anti-aliasing by quality preset.
func apply_quality() -> void:
	var q: int = Game.s.settings.quality
	var vp := get_viewport()
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR
	vp.scaling_3d_scale = 1.0 if test_mode else [0.5, 0.62, 0.72, 0.9][q]
	vp.msaa_3d = Viewport.MSAA_4X if q >= 3 else (Viewport.MSAA_2X if q >= 2 else Viewport.MSAA_DISABLED)
	vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA
	vp.mesh_lod_threshold = [4.0, 2.0, 1.0, 0.5][q]

func apply_fov() -> void:
	if world: world.cam.fov = Game.s.settings.fov

func _on_quest_event(ev: Dictionary) -> void:
	match ev.type:
		"step_done":
			var extra := ""
			if int(ev.units) > 0: extra += "  +%d units" % ev.units
			for k in ev.give: extra += "  +%d %s" % [ev.give[k], Data.ITEMS[k].name]
			Game.toast.emit("✓ " + ev.text + extra, "good"); sfx("quest")
		"quest_start": hud.banner(ev.title, "New chapter", Hud.AMBER)

func capture(on: bool) -> void:
	if test_mode: return
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if on else Input.MOUSE_MODE_VISIBLE

func _unhandled_input(e: InputEvent) -> void:
	if not playing() or world == null: return
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		if mode == "foot" and world is SurfaceWorld: world.player.look(e.relative)
		elif ship: ship.look(e.relative)
	elif e is InputEventMouseButton and e.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED: capture(true)

func _process(dt: float) -> void:
	if not started or world == null or busy: return
	if get_tree().paused: return
	Game.s.stats.time += dt
	if ship: ship.tick(dt)
	if world is SurfaceWorld:
		var w: SurfaceWorld = world
		if mode == "foot": w.player.update_camera(dt)
		else:
			ship.update_camera(dt, w.cam)
			w.player.global_position = ship.global_position
			if ship.global_position.y > w.hf.sea + 3400.0 and ship.state == "flying": to_space()
		_warden(w)
	elif world is SpaceWorld:
		ship.update_camera(dt, world.cam)
	_hotkeys()
	_markers()
	story_t -= dt
	if story_t <= 0.0: story_t = 0.5; Game.story("tick")
	save_t += dt
	if save_t > 20.0: save_t = 0.0; persist()
	if audio: audio.ambient(self, dt)

func _hotkeys() -> void:
	if not playing(): return
	hud.prompt.text = ""
	if world is SurfaceWorld:
		var w: SurfaceWorld = world
		if mode == "foot":
			var it: Dictionary = w.prompt_for(w.player.global_position)
			if not it.is_empty():
				hud.prompt.text = "[E]  " + (it.text.call() if it.text is Callable else it.text)
				if Input.is_action_just_pressed("interact"): it.call.call()
			if it.is_empty():
				for a in w.actors:
					if is_instance_valid(a) and a.has_meta("lore") and a.global_position.distance_to(w.player.global_position) < 3.2:
						hud.prompt.text = "[E]  Talk"
						if Input.is_action_just_pressed("interact"): _lore(a)
						break
			if Input.is_action_just_pressed("view"): w.player.view = "third" if w.player.view == "first" else "first"
			if Input.is_action_just_pressed("heal") and w.player.health < 100.0 and Game.remove_item("medgel", 1):
				w.player.health = minf(100.0, w.player.health + 60.0); sfx("heal"); Game.toast.emit("Med Gel used", "good")
		else:
			if ship.state == "landed":
				hud.prompt.text = "[E]  Leave ship      [W]  Take off"
				if Input.is_action_just_pressed("interact"): leave_ship()
			if Input.is_action_just_pressed("view"): ship.view = "third" if ship.view == "first" else "first"
	elif world is SpaceWorld:
		if Input.is_action_just_pressed("view"): ship.view = "third" if ship.view == "first" else "first"
		if ship.state == "docked":
			hud.prompt.text = "[E]  Station services"
			if Input.is_action_just_pressed("interact"): menus.station()
	if menus:
		if Input.is_action_just_pressed("inventory"): menus.inventory()
		elif Input.is_action_just_pressed("journal"): menus.journal()
		elif Input.is_action_just_pressed("pause"): menus.pause()
		elif Input.is_action_just_pressed("map") and mode == "ship": menus.galaxy()

func _markers() -> void:
	hud.markers.clear()
	var st := Game.step()
	if world is SurfaceWorld:
		var w: SurfaceWorld = world
		if mode == "foot" and w.player.global_position.distance_to(ship.global_position) > 30.0:
			hud.markers.append({"pos": ship.global_position + Vector3(0, 3, 0), "text": "Ship", "color": Hud.CYAN})
		var here: bool = not st.has("system") or (st.system == w.sys.id and int(st.get("planet", w.desc.index)) == w.desc.index)
		var mk: String = st.get("mark", "")
		if mk == "ship": pass
		elif mk != "" and mk != "station" and here:
			var s: Dictionary = w.site_of(mk)
			if not s.is_empty(): hud.markers.append({"pos": s.pos + Vector3(0, 12, 0), "text": s.name})
		for s in w.sites:
			if s.type != mk and s.type != "crash" and w.cam.global_position.distance_to(s.pos) < 2500.0:
				hud.markers.append({"pos": s.pos + Vector3(0, 12, 0), "text": s.name, "color": Color(1, 1, 1, 0.75)})
	elif world is SpaceWorld:
		var sw: SpaceWorld = world
		var goal_here: bool = not st.has("system") or st.system == sw.sys.id
		for p in sw.planets:
			var is_goal: bool = goal_here and st.has("planet") and int(st.planet) == p.desc.index and st.get("mark", "") != "station"
			hud.markers.append({"pos": p.node.position + Vector3(0, p.radius * 1.1, 0), "text": p.desc.name, "color": Hud.AMBER if is_goal else Color(1, 1, 1, 0.8)})
		hud.markers.append({"pos": sw.bay, "text": sw.sys.station.name, "color": Hud.AMBER if st.get("mark", "") == "station" and goal_here else Hud.CYAN})

# ---------------------------------------------------------------- actions
func board_ship() -> void:
	if not Game.s.flags.has("ship_repaired"):
		var r := Game.story("interact", {"what": "repair"})
		if r == "lack" or r == "": Game.toast.emit("The hull is breached. Repairs need 30 Ferrite and 20 Carbon.", "bad"); sfx("deny")
		else: sfx("repair"); hud.banner("Ship repaired", "Systems online", Hud.CYAN)
		return
	var w: SurfaceWorld = world
	mode = "ship"; ship.board(); w.player.active = false; w.player.visible = false; w.player.beam.visible = false; w.player.tool_node.visible = false
	sfx("door")

func leave_ship() -> void:
	var w: SurfaceWorld = world
	var at := ship.global_position + ship.global_transform.basis.x * 6.5
	w.player.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.2, at.z)
	w.player.velocity = Vector3.ZERO; w.player.active = true; w.player.visible = true
	w.player.yaw = ship.rotation.y; mode = "foot"; ship.piloted = false
	w.cam.fov = Game.s.settings.fov
	sfx("door")

func on_mined(item: String, n: int) -> void:
	var got := Game.add_item(item, n)
	Game.s.stats.mined += got
	if got < n: Game.toast.emit("%s storage full" % Data.ITEMS[item].name, "bad")
	sfx("pickup", -10.0)

func on_takeoff() -> void: pass

func on_landed() -> void:
	var w: SurfaceWorld = world
	persist()
	for s in w.sites:
		if ship.global_position.distance_to(s.pos) < s.radius + 260.0:
			Game.story("arrive", {"site": s.type, "system": w.sys.id})
			hud.banner(s.name, w.desc.name)
			return

func on_death() -> void:
	hud.banner("You died", "Your ship recovers you", Color(1.0, 0.35, 0.3))
	sfx("death")
	await get_tree().create_timer(2.8).timeout
	if not (world is SurfaceWorld): return
	var w: SurfaceWorld = world
	var at := ship.global_position + ship.global_transform.basis.x * 6.5
	w.player.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.2, at.z)
	w.player.health = 100.0; w.player.shield = Game.shield_max(); w.player.hazard = 1.0; w.player.dead = false; w.player.velocity = Vector3.ZERO

func on_ship_destroyed() -> void:
	ship.hull = Game.ship_hull()
	var lost := int(Game.s.units * 0.1); Game.s.units -= lost
	hud.banner("Ship crippled", "Emergency repairs cost %d units" % lost, Color(1.0, 0.35, 0.3))
	ship.vel = Vector3.ZERO; ship.throttle = 0.0

func _lore(a: Actor) -> void:
	var lines: Array = Data.LORE.get(a.faction, Data.LORE.thalori)
	var line: String = lines[hash(a.get_instance_id()) % lines.size()]
	if not Game.s.lore.has(line): Game.s.lore.append(line)
	say("Villager", Data.FACTIONS[a.faction].name if Data.FACTIONS.has(a.faction) else "", [line], Data.FACTIONS[a.faction].color if Data.FACTIONS.has(a.faction) else Color.WHITE)

func _warden(w: SurfaceWorld) -> void:
	if not w.has_meta("gate_site") or Game.s.flags.has("warden_down") or is_instance_valid(warden): return
	var st := Game.step()
	if st.get("kind", "") != "warden": return
	var gs: Dictionary = w.get_meta("gate_site")
	warden = Actor.new(w, "warden", gs.pos + Vector3(0, 0, 34.0))
	w.add_child(warden); w.actors.append(warden)
	hud.banner("The Warden", "Guardian of the Gate", Color(0.8, 0.5, 1.0)); sfx("alarm")

func on_kill(kind: String, pos: Vector3) -> void:
	Game.s.stats.kills += 1
	if kind == "warden": Game.s.flags["warden_down"] = true; Game.s.units += 5000; Game.toast.emit("The Warden falls. +5000 units", "loot")
	elif kind != "pirate": Game.s.units += 120
	Game.story("kill", {"kind": kind})
	if Game.s.bounty != null and Game.s.bounty.kind == "hunt": Game.s.bounty.done += 1

func persist() -> void:
	if world is SurfaceWorld: world.save_state()
	if not test_mode: Game.save()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and started: persist()
