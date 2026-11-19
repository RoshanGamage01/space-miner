class_name SurfaceWorld extends Node3D
## One planet's surface: terrain, plants, sky, settlements, the player and
## their ship.

var main
var desc: Dictionary
var sys: Dictionary
var biome: Dictionary
var hf: Heightfield
var terrain: Terrain
var flora: Flora
var atmo: Atmosphere
var water: MeshInstance3D
var has_water := false
var cam := Camera3D.new()
var player: Player
var ship: Ship
var sites: Array = []
var interact: Array = [] # {pos, radius, text, call}
var actors: Array = []
var bolts: Array = []
var ground := StaticBody3D.new()
var ground_shape := HeightMapShape3D.new()
var ground_center := Vector2(1e9, 1e9)
var ground_busy := false
var hazard_t := 0.0
var bolt_mesh: CapsuleMesh

func _init(m, system: Dictionary, planet: Dictionary) -> void:
	main = m; sys = system; desc = planet
	biome = Biomes.TYPES[desc.type].duplicate()
	var q: int = Game.s.settings.quality
	hf = Heightfield.new(desc.seed, biome.relief, biome.sea + desc.get("sea_bias", 0.0))
	biome.sea = hf.sea
	hf.tree_density = biome.tree_density; hf.tree_max_h = minf(260.0, biome.snow_line - 40.0)
	has_water = biome.sea > -100.0
	_place_sites()
	terrain = Terrain.new(hf, biome); terrain.view_roots = 2 if q >= 2 else 1; add_child(terrain)
	flora = Flora.new(hf, biome, desc.seed, q); add_child(flora)
	for id in Game.s.mined.get(_key(), []): flora.removed[id] = true
	atmo = Atmosphere.new(biome, q); atmo.time_of_day = desc.tod; add_child(atmo)
	if has_water: _make_water()
	cam.far = 24000.0; cam.near = 0.12; cam.fov = Game.s.settings.fov; add_child(cam); cam.make_current()
	var cs := CollisionShape3D.new(); cs.shape = ground_shape; ground.add_child(cs); add_child(ground)
	ground_shape.map_width = 65; ground_shape.map_depth = 65
	bolt_mesh = CapsuleMesh.new(); bolt_mesh.radius = 0.045; bolt_mesh.height = 1.6
	player = Player.new(self); add_child(player); player.attach_camera(cam)
	ship = Ship.new(self); add_child(ship)
	for s in sites: Sites.build(self, s)
	interact.append({"pos": Vector3.ZERO, "radius": 7.5, "text": func(): return "Board ship" if Game.s.flags.has("ship_repaired") else "Repair ship  (30 Ferrite, 20 Carbon)", "call": func(): main.board_ship(), "cond": Callable(), "ship": true})

func _key() -> String: return "%s:%d" % [sys.id, desc.index]

func _place_sites() -> void:
	var rnd := RandomNumberGenerator.new(); rnd.seed = desc.seed + 3
	var list: Array = desc.sites
	var village_pos := Vector2.ZERO
	var k := 0
	for sd in list:
		if sd.type == "crash": continue
		var ang := k * 2.3 + rnd.randf() * 0.8; var dist := 500.0 + k * 620.0 + rnd.randf() * 300.0
		var p := hf.find_flat(cos(ang) * dist, sin(ang) * dist, rnd)
		var radius: float = {"village": 62.0, "capital": 105.0, "outpost": 48.0, "ruins": 52.0, "gate": 75.0}.get(sd.type, 50.0)
		var h := maxf(hf.raw(p.x, p.y), hf.sea + 3.0)
		hf.sites.append({"pos": p, "radius": radius, "h": h})
		sites.append({"type": sd.type, "name": sd.name, "faction": sd.get("faction", ""), "npc": sd.get("npc", ""), "relic": sd.get("relic", false), "pos": Vector3(p.x, h, p.y), "radius": radius, "index": sites.size(), "node": null})
		if sd.type == "village" and village_pos == Vector2.ZERO: village_pos = p
		k += 1
	for sd in list:
		if sd.type != "crash": continue
		var p := hf.find_flat(village_pos.x + 240.0, village_pos.y + 160.0, rnd, 4.0, 90.0)
		for tries in 30:
			if p.distance_to(village_pos) > 190.0 and p.distance_to(village_pos) < 420.0: break
			var a := rnd.randf() * TAU
			p = hf.find_flat(village_pos.x + cos(a) * 280.0, village_pos.y + sin(a) * 280.0, rnd, 4.0, 90.0)
		var h := hf.raw(p.x, p.y)
		hf.sites.append({"pos": p, "radius": 20.0, "h": h})
		sites.append({"type": "crash", "name": "Crash Site", "faction": "", "npc": "", "relic": false, "pos": Vector3(p.x, h, p.y), "radius": 20.0, "index": sites.size(), "node": null})

func site_of(type: String) -> Dictionary:
	for s in sites: if s.type == type: return s
	return {}

func _make_water() -> void:
	water = MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(60000, 60000); pm.subdivide_width = 80; pm.subdivide_depth = 80
	water.mesh = pm; var wm := ShaderMaterial.new(); wm.shader = load("res://shaders/water.gdshader")
	var nt := NoiseTexture2D.new(); var fn := FastNoiseLite.new(); fn.frequency = 0.02; fn.fractal_octaves = 4
	nt.noise = fn; nt.seamless = true; nt.as_normal_map = true; nt.bump_strength = 5.0; nt.width = 512; nt.height = 512; nt.generate_mipmaps = true
	var ft := NoiseTexture2D.new(); var f2 := FastNoiseLite.new(); f2.noise_type = FastNoiseLite.TYPE_CELLULAR; f2.frequency = 0.03
	ft.noise = f2; ft.seamless = true; ft.generate_mipmaps = true
	wm.set_shader_parameter("wave_nor", nt); wm.set_shader_parameter("foam_tex", ft); wm.set_shader_parameter("deep", biome.water)
	wm.set_shader_parameter("lava", 1.0 if biome.get("lava", false) else 0.0)
	water.material_override = wm; water.position.y = hf.sea; water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)

func loading() -> bool:
	return terrain.pending > 0 or flora.pending > 0 or ground_busy or ground_center.x > 1e8

func _process(dt: float) -> void:
	var focus := cam.global_position
	terrain.update(focus); flora.update(focus)
	if water: water.position = Vector3(snappedf(focus.x, 500.0), hf.sea, snappedf(focus.z, 500.0))
	RenderingServer.global_shader_parameter_set("player_pos", player.global_position)
	var w := atmo.clock * 0.05
	RenderingServer.global_shader_parameter_set("wind_dir", Vector3(cos(w), 0, sin(w)) * (0.8 + 0.3 * sin(atmo.clock * 0.21)))
	var pp := Vector2(player.global_position.x, player.global_position.z)
	if not ground_busy and pp.distance_to(ground_center) > 14.0:
		ground_busy = true
		WorkerThreadPool.add_task(_build_ground.bind(Vector2(roundf(pp.x), roundf(pp.y))))
	_bolts(dt)
	for a in actors: if is_instance_valid(a): a.tick(dt)
	actors = actors.filter(func(a): return is_instance_valid(a))
	# Harsh worlds drain hazard protection while on foot.
	if main.mode == "foot" and biome.hazard != "" and not player.dead:
		player.hazard -= dt / Game.hazard_time()
		if player.hazard <= 0.0:
			player.hazard = 0.0; hazard_t -= dt
			if hazard_t <= 0.0: hazard_t = 1.0; player.hurt(6.0)
	else: player.hazard = minf(1.0, player.hazard + dt * 0.2)

func _build_ground(c: Vector2) -> void:
	var data := PackedFloat32Array(); data.resize(65 * 65)
	for j in 65:
		for i in 65: data[j * 65 + i] = hf.height(c.x - 32.0 + i, c.y - 32.0 + j)
	_apply_ground.call_deferred(c, data)

func _apply_ground(c: Vector2, data: PackedFloat32Array) -> void:
	ground_shape.map_data = data
	ground.position = Vector3(c.x, 0, c.y)
	ground_center = c; ground_busy = false

## Ray against physics bodies and the terrain. Returns {pos, body, normal} or {}.
func raycast(from: Vector3, dir: Vector3, max_d: float, exclude: Array = []) -> Dictionary:
	var best := {}
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * max_d, 0xFFFFFFFF)
	var rids: Array[RID] = []
	for e in exclude: if e is CollisionObject3D: rids.append(e.get_rid())
	rids.append(ground.get_rid())
	q.exclude = rids
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	var limit := max_d
	if not hit.is_empty():
		best = {"pos": hit.position, "body": hit.collider, "normal": hit.normal}
		limit = from.distance_to(hit.position)
	# March the height function.
	var t := 0.0; var step := 0.6; var prev := 0.0
	while t < limit:
		var p := from + dir * t
		var d := p.y - hf.height(p.x, p.z)
		if d < 0.0:
			var a := prev; var b := t
			for i in 6:
				var m := (a + b) * 0.5; var pm := from + dir * m
				if pm.y - hf.height(pm.x, pm.z) < 0.0: b = m
				else: a = m
			var hp := from + dir * b
			return {"pos": hp, "body": null, "normal": hf.normal(hp.x, hp.z)}
		prev = t
		step = clampf(d * 0.5, 0.4, 30.0); t += step
	return best

func shoot(from: Vector3, dir: Vector3, dmg: float, friendly: bool, speed := 150.0, color := Color(1.0, 0.5, 0.2)) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = bolt_mesh
	mi.material_override = Kit.glow(color if not friendly else Color(0.4, 0.95, 1.0), 14.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	bolts.append({"node": mi, "pos": from, "dir": dir, "dmg": dmg, "friendly": friendly, "life": 3.0, "speed": speed})

func _bolts(dt: float) -> void:
	for b in bolts:
		var step: float = b.speed * dt
		var excl: Array = [player] if b.friendly else []
		if main.mode == "ship" or b.friendly: excl.append(ship.body)
		var hit := raycast(b.pos, b.dir, step, excl)
		if not hit.is_empty():
			b.life = 0.0
			burst(hit.pos, Color(1.0, 0.7, 0.3))
			var body = hit.get("body")
			if body != null:
				var target = body if body.has_method("damage") else (body.get_parent() if body.get_parent() and body.get_parent().has_method("damage") else null)
				if target != null and (b.friendly != (target == player or target == ship)): target.damage(b.dmg, player if b.friendly else null)
		b.pos += b.dir * step; b.life -= dt
		var x: Vector3 = b.dir.cross(Vector3.UP)
		if x.length() < 0.01: x = Vector3.RIGHT
		x = x.normalized()
		b.node.global_transform = Transform3D(Basis(x, b.dir, x.cross(b.dir)), b.pos)
		if b.life <= 0.0: b.node.queue_free()
	bolts = bolts.filter(func(b): return b.life > 0.0)

func burst(pos: Vector3, color: Color, amount := 40) -> void:
	var p := GPUParticles3D.new(); p.amount = amount; p.lifetime = 0.7; p.one_shot = true; p.explosiveness = 0.95
	var pm := ParticleProcessMaterial.new(); pm.direction = Vector3.UP; pm.spread = 80.0; pm.initial_velocity_min = 2.0; pm.initial_velocity_max = 7.0
	pm.gravity = Vector3(0, -9, 0); pm.scale_min = 0.6; pm.scale_max = 1.6
	p.process_material = pm
	var q := QuadMesh.new(); q.size = Vector2(0.09, 0.09)
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.albedo_color = color; m.emission_enabled = true; m.emission = color; m.emission_energy_multiplier = 6.0
	q.material = m; p.draw_pass_1 = q
	add_child(p); p.global_position = pos; p.emitting = true
	var l := OmniLight3D.new(); l.light_color = color; l.light_energy = 4.0; l.omni_range = 6.0; p.add_child(l)
	get_tree().create_timer(0.15).timeout.connect(func(): if is_instance_valid(l): l.queue_free())
	get_tree().create_timer(1.2).timeout.connect(func(): if is_instance_valid(p): p.queue_free())

func ground_at(x: float, z: float) -> float:
	return maxf(hf.height(x, z), hf.sea if has_water else -1e9)

func add_interact(pos: Vector3, radius: float, text: String, cb: Callable, cond: Callable = Callable()) -> void:
	interact.append({"pos": pos, "radius": radius, "text": text, "call": cb, "cond": cond})

func prompt_for(p: Vector3) -> Dictionary:
	var best := {}; var bd := 1e9
	for it in interact:
		if it.has("ship"): it.pos = ship.global_position
		var d: float = p.distance_to(it.pos)
		if d < it.radius and d < bd and (not it.cond.is_valid() or it.cond.call()): best = it; bd = d
	return best

func save_state() -> void:
	Game.s.mined[_key()] = flora.removed.keys().slice(maxi(0, flora.removed.size() - 400))
	Game.s.pos = [player.global_position.x, player.global_position.y, player.global_position.z]
	Game.s.ship_pos = [ship.global_position.x, ship.global_position.y, ship.global_position.z, ship.rotation.y]
