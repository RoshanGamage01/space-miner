class_name SpaceWorld extends Node3D
## A star system: sun, planets, the station and whoever else is flying around.

var main
var sys: Dictionary
var cam := Camera3D.new()
var ship: Ship
var planets: Array = [] # {desc, node, radius}
var station: Node3D
var bay := Vector3.ZERO
var sun_dir := Vector3(0, 0, 1)
var bolts: Array = []
var pirates: Array = []
var bolt_mesh: CapsuleMesh
var pirate_t := 25.0
var env := Environment.new()
var docked_at := Transform3D()
var warp_fx := 0.0
static var noise3d: NoiseTexture3D

func _init(m, system: Dictionary) -> void:
	main = m; sys = system
	var sky_mat := ShaderMaterial.new(); sky_mat.shader = load("res://shaders/sky.gdshader")
	var nt := NoiseTexture2D.new(); var fn := FastNoiseLite.new(); fn.frequency = 0.008; fn.fractal_octaves = 5
	nt.noise = fn; nt.seamless = true; nt.generate_mipmaps = true
	sky_mat.set_shader_parameter("cloud_tex", nt); sky_mat.set_shader_parameter("airless", 1.0); sky_mat.set_shader_parameter("cloud_cover", 0.0)
	sky_mat.set_shader_parameter("moon_size", 0.0); sky_mat.set_shader_parameter("sun_dir", Vector3(0.5, 0.25, 0.8).normalized())
	var sky := Sky.new(); sky.sky_material = sky_mat; sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.16, 0.19, 0.28); env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_AGX; env.tonemap_exposure = 1.0; env.tonemap_white = 6.0
	env.glow_enabled = true; env.glow_intensity = 0.7; env.glow_bloom = 0.08; env.glow_hdr_threshold = 1.0
	env.set_glow_level(2, 0.6); env.set_glow_level(4, 1.0); env.set_glow_level(6, 0.8)
	env.ssao_enabled = Game.s.settings.quality >= 1
	env.adjustment_enabled = true; env.adjustment_contrast = 1.08; env.adjustment_saturation = 1.15
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	cam.far = 120000.0; cam.near = 0.3; cam.fov = Game.s.settings.fov; add_child(cam); cam.make_current()
	sun_dir = Vector3(0.5, 0.25, 0.8).normalized()
	var sun := DirectionalLight3D.new(); sun.light_color = sys.star.color; sun.light_energy = 2.6; sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 400.0; sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun); sun.look_at_from_position(Vector3.ZERO, -sun_dir, Vector3.UP)
	# The star itself, far away.
	var sm := ShipModel._sphere(2600.0)
	var star := Kit.inst(sm, Kit.glow(sys.star.color, 30.0), self, sun_dir * 90000.0); star.name = "Star"
	star.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if noise3d == null:
		noise3d = NoiseTexture3D.new(); var n3 := FastNoiseLite.new(); n3.frequency = 0.02; n3.fractal_octaves = 4
		noise3d.noise = n3; noise3d.seamless = true; noise3d.width = 96; noise3d.height = 96; noise3d.depth = 96
	for d in sys.planets: _planet(d)
	_station()
	bolt_mesh = CapsuleMesh.new(); bolt_mesh.radius = 0.12; bolt_mesh.height = 5.0
	ship = Ship.new(self, true); add_child(ship)
	_asteroids()

func _planet(d: Dictionary) -> void:
	var b: Dictionary = Biomes.TYPES[d.type]
	var n := Node3D.new(); n.position = d.pos; add_child(n)
	var sm := SphereMesh.new(); sm.radius = d.radius; sm.height = d.radius * 2.0; sm.radial_segments = 128; sm.rings = 64
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/planet.gdshader")
	m.set_shader_parameter("noise", noise3d)
	var oc: Array = ORBIT[d.type]
	var a_col: Color = oc[0]; var b_col: Color = oc[1]
	m.set_shader_parameter("land_a", a_col); m.set_shader_parameter("land_b", b_col)
	m.set_shader_parameter("rock_col", oc[2])
	m.set_shader_parameter("sea_col", b.water if not b.get("lava", false) else Color(0.9, 0.2, 0.02))
	var has_sea: bool = b.sea > -100.0
	m.set_shader_parameter("sea_level", (0.5 + d.get("sea_bias", 0.0) * 0.003) if has_sea else 0.0)
	m.set_shader_parameter("ice", 0.9 if d.type == "frozen" else (0.14 if d.type == "lush" else 0.0))
	m.set_shader_parameter("clouds", b.clouds)
	m.set_shader_parameter("lava", 1.0 if b.get("lava", false) else 0.0)
	m.set_shader_parameter("seed", Vector3(d.seed % 97, d.seed % 53, d.seed % 31) * 0.137)
	var mi := Kit.inst(sm, m, n); mi.rotation = Vector3(0.3, d.seed % 6, 0.1)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if not b.get("airless", false):
		var am := SphereMesh.new(); am.radius = d.radius * 1.045; am.height = d.radius * 2.09; am.radial_segments = 96; am.rings = 48
		var rm := ShaderMaterial.new(); rm.shader = load("res://shaders/atmo_rim.gdshader")
		rm.set_shader_parameter("tint", b.sky.lerp(b.haze, 0.35)); rm.set_shader_parameter("sun_dir", sun_dir)
		Kit.inst(am, rm, n).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	planets.append({"desc": d, "node": n, "radius": d.radius})

## Land colours of each world type as seen from orbit.
const ORBIT := {
	"lush": [Color(0.16, 0.3, 0.09), Color(0.3, 0.27, 0.15), Color(0.34, 0.33, 0.32)],
	"desert": [Color(0.62, 0.3, 0.14), Color(0.72, 0.5, 0.28), Color(0.45, 0.22, 0.12)],
	"frozen": [Color(0.8, 0.85, 0.92), Color(0.65, 0.72, 0.85), Color(0.3, 0.34, 0.42)],
	"volcanic": [Color(0.12, 0.09, 0.08), Color(0.2, 0.14, 0.12), Color(0.08, 0.07, 0.07)],
	"barren": [Color(0.4, 0.4, 0.42), Color(0.28, 0.28, 0.3), Color(0.2, 0.2, 0.22)],
	"exotic": [Color(0.5, 0.16, 0.38), Color(0.32, 0.2, 0.5), Color(0.35, 0.3, 0.42)],
}

func _station() -> void:
	station = Node3D.new(); station.position = sys.station.pos; add_child(station)
	var fac: String = sys.get("faction", "")
	var accent: Color = Data.FACTIONS[fac].color if fac != "" else Color(0.8, 0.8, 0.9)
	var hull := Kit.metal(Color(0.78, 0.8, 0.84), 0.38, 0.8, 0.12)
	var dark := Kit.metal(Color(0.12, 0.13, 0.16), 0.5, 0.9, 0.2)
	var panel := Kit.metal(Color(0.05, 0.08, 0.2), 0.2, 1.0, 0.4)
	# Core spindle.
	Kit.inst(Kit.loft([[-150.0, 6.0, 6.0, 0, 2.0], [-120.0, 22.0, 22.0, 0, 2.0], [-40.0, 30.0, 30.0, 0, 2.0], [40.0, 30.0, 30.0, 0, 2.0], [120.0, 22.0, 22.0, 0, 2.0], [150.0, 6.0, 6.0, 0, 2.0]], 48), hull, station, Vector3.ZERO, Vector3(PI / 2, 0, 0))
	for y in [-90.0, -30.0, 30.0, 90.0]:
		Kit.inst(ShipModel._torus(31.0 if absf(y) < 50.0 else 26.0, 1.2), Kit.glow(accent, 4.0), station, Vector3(0, y, 0))
	# Habitat ring, slowly turning.
	var ring := Node3D.new(); ring.name = "Ring"; station.add_child(ring)
	var rt := TorusMesh.new(); rt.inner_radius = 150.0; rt.outer_radius = 178.0; rt.rings = 128; rt.ring_segments = 24
	Kit.inst(rt, hull, ring)
	var rt2 := TorusMesh.new(); rt2.inner_radius = 176.0; rt2.outer_radius = 181.0; rt2.rings = 128; rt2.ring_segments = 10
	Kit.inst(rt2, dark, ring)
	for i in 6:
		var a := TAU * i / 6.0
		Kit.inst(Kit.cyl(4.5, 4.5, 125.0, 16), dark, ring, Vector3(cos(a) * 91.0, 0, sin(a) * 91.0), Vector3(0, -a, PI / 2))
	for i in 48:
		var a := TAU * i / 48.0
		Kit.inst(Kit.bbox(Vector3(7.0, 3.0, 0.6), 0.1), Kit.glow(Color(1.0, 0.85, 0.6), 3.0), ring, Vector3(cos(a) * 164.0, 13.7, sin(a) * 164.0), Vector3(0, -a + PI / 2, 0))
	# Solar wings.
	for side in [-1.0, 1.0]:
		Kit.inst(Kit.cyl(2.0, 2.0, 160.0, 12), dark, station, Vector3(side * 110.0, -120.0, 0), Vector3(0, 0, PI / 2))
		for k in 3:
			Kit.inst(Kit.bbox(Vector3(46.0, 0.8, 90.0), 0.2), panel, station, Vector3(side * (70.0 + k * 50.0), -120.0, 0), Vector3(0.2, 0, 0))
	# Hangar bay facing +Z on the core.
	var bay_n := Node3D.new(); bay_n.position = Vector3(0, 0, 34.0); station.add_child(bay_n)
	Kit.inst(Kit.bbox(Vector3(70.0, 30.0, 44.0), 1.5), hull, bay_n, Vector3(0, 0, 10.0))
	Kit.inst(Kit.bbox(Vector3(58.0, 20.0, 2.0), 0.3), Kit.glow(Color(0.5, 0.85, 1.0), 2.0), bay_n, Vector3(0, 0, 31.6))
	Kit.inst(Kit.bbox(Vector3(62.0, 1.2, 3.0), 0.2), Kit.glow(accent, 6.0), bay_n, Vector3(0, 11.0, 32.4))
	Kit.inst(Kit.bbox(Vector3(62.0, 1.2, 3.0), 0.2), Kit.glow(accent, 6.0), bay_n, Vector3(0, -11.0, 32.4))
	for i in 6:
		Kit.inst(ShipModel._sphere(1.2), Kit.glow(Color(0.4, 1.0, 0.6), 8.0), bay_n, Vector3(-25.0 + i * 10.0, -13.0, 40.0 + i * 0.0))
	var l := OmniLight3D.new(); l.light_color = Color(0.6, 0.85, 1.0); l.light_energy = 20.0; l.omni_range = 160.0; l.position = Vector3(0, 0, 60.0); bay_n.add_child(l)
	bay = station.position + Vector3(0, 0, 34.0 + 34.0)
	Kit.inst(Kit.cyl(0.6, 0.6, 60.0, 8), dark, station, Vector3(0, 180.0, 0))
	Kit.inst(ShipModel._sphere(1.6), Kit.glow(Color(1, 0.2, 0.15), 10.0), station, Vector3(0, 211.0, 0))

func _asteroids() -> void:
	var meshes: Array = []
	for nm in ["moon_rock_01", "moon_rock_02", "moon_rock_03", "namaqualand_boulder_03"]:
		var sc: PackedScene = load("res://assets/models/%s/%s.gltf" % [nm, nm])
		if sc == null: continue
		var r := sc.instantiate()
		for mi in r.find_children("*", "MeshInstance3D", true, false): meshes.append(mi.mesh)
		r.free()
	if meshes.is_empty(): return
	var rnd := RandomNumberGenerator.new(); rnd.seed = sys.seed
	var center: Vector3 = sys.station.pos + Vector3(5200, 500, -4200)
	for mi in meshes.size():
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = meshes[mi]; mm.instance_count = 60
		for i in 60:
			var p := center + Vector3(rnd.randfn(0, 1700), rnd.randfn(0, 220), rnd.randfn(0, 1700))
			var s := rnd.randf_range(6.0, 40.0) * (3.0 if rnd.randf() > 0.93 else 1.0) / maxf(meshes[mi].get_aabb().size.length() * 0.5, 0.2)
			mm.set_instance_transform(i, Transform3D(Basis.from_euler(Vector3(rnd.randf() * TAU, rnd.randf() * TAU, rnd.randf() * TAU)).scaled(Vector3.ONE * s), p))
		var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; add_child(mmi)

func loading() -> bool: return false
func ground_at(_x: float, _z: float) -> float: return -1e9

func raycast(from: Vector3, dir: Vector3, max_d: float, exclude: Array = []) -> Dictionary:
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * max_d, 0xFFFFFFFF)
	var rids: Array[RID] = []
	for e in exclude: if e is CollisionObject3D: rids.append(e.get_rid())
	q.exclude = rids
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if hit.is_empty(): return {}
	return {"pos": hit.position, "body": hit.collider, "normal": hit.normal}

func shoot(from: Vector3, dir: Vector3, dmg: float, friendly: bool, speed := 600.0, color := Color(1.0, 0.4, 0.2)) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = bolt_mesh
	mi.material_override = Kit.glow(Color(0.4, 0.95, 1.0) if friendly else color, 7.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	bolts.append({"node": mi, "pos": from, "dir": dir, "dmg": dmg, "friendly": friendly, "life": 2.5, "speed": speed})

func burst(pos: Vector3, color: Color, amount := 60) -> void:
	var p := GPUParticles3D.new(); p.amount = amount; p.lifetime = 1.0; p.one_shot = true; p.explosiveness = 0.95
	var pm := ParticleProcessMaterial.new(); pm.spread = 180.0; pm.initial_velocity_min = 8.0; pm.initial_velocity_max = 40.0; pm.gravity = Vector3.ZERO
	pm.scale_min = 2.0; pm.scale_max = 6.0; p.process_material = pm
	var q := QuadMesh.new(); q.size = Vector2(0.6, 0.6)
	var m := Kit.spark_mat(color)
	q.material = m; p.draw_pass_1 = q
	add_child(p); p.global_position = pos; p.emitting = true
	get_tree().create_timer(1.6).timeout.connect(p.queue_free)

func _process(dt: float) -> void:
	(station.get_node("Ring") as Node3D).rotate_y(dt * 0.03)
	_bolts(dt)
	_pirates(dt)
	if ship.state != "flying": return
	# Docking.
	if ship.global_position.distance_to(bay) < 55.0 and ship.speed < 140.0: main.dock(); return
	# Atmospheric entry.
	for p in planets:
		if ship.global_position.distance_to(p.node.position) < p.radius * 1.045 + 60.0:
			main.to_surface(p.desc); return

func _bolts(dt: float) -> void:
	for b in bolts:
		var step: float = b.speed * dt
		b.pos += b.dir * step; b.life -= dt
		if b.friendly:
			for pr in pirates:
				if pr.node.global_position.distance_to(b.pos) < 9.0:
					pr.hp -= b.dmg; b.life = 0.0; burst(b.pos, Color(1, 0.7, 0.3), 20)
		elif ship.global_position.distance_to(b.pos) < 6.0:
			ship.damage(b.dmg); b.life = 0.0; burst(b.pos, Color(1, 0.5, 0.3), 20)
		var x: Vector3 = b.dir.cross(Vector3.UP)
		if x.length() < 0.01: x = Vector3.RIGHT
		x = x.normalized()
		b.node.global_transform = Transform3D(Basis(x, b.dir, x.cross(b.dir)), b.pos)
		if b.life <= 0.0: b.node.queue_free()
	bolts = bolts.filter(func(b): return b.life > 0.0)

func _pirates(dt: float) -> void:
	pirate_t -= dt
	var danger: bool = sys.id != Data.HOME or Game.s.quest.q >= 2
	if pirate_t <= 0.0 and pirates.size() < 2 and danger and ship.state == "flying" and ship.global_position.distance_to(bay) > 900.0:
		pirate_t = randf_range(50.0, 110.0)
		var n := ShipModel.build(Color(0.35, 0.06, 0.05)); add_child(n)
		n.global_position = ship.global_position + ship.forward() * 1400.0 + Vector3(randf_range(-500, 500), randf_range(-300, 300), randf_range(-500, 500))
		pirates.append({"node": n, "hp": 110.0, "fire": 2.0, "vel": Vector3.ZERO})
		Game.toast.emit("Pirate signature detected", "bad"); main.sfx("alarm")
	for pr in pirates:
		var n: Node3D = pr.node
		var to: Vector3 = ship.global_position - n.global_position; var d := to.length()
		var want := to.normalized() if d > 260.0 else (-to.normalized() + n.global_transform.basis.x).normalized()
		var cur := -n.global_transform.basis.z
		var nd := cur.slerp(want, minf(1.0, dt * 1.1)).normalized()
		n.look_at(n.global_position + nd, Vector3.UP)
		pr.vel = pr.vel.lerp(nd * (ship.speed * 0.5 + 230.0), minf(1.0, dt * 1.2))
		n.global_position += pr.vel * dt
		pr.fire -= dt
		if pr.fire <= 0.0 and d < 900.0 and nd.dot(to.normalized()) > 0.93:
			pr.fire = 0.5
			shoot(n.global_position + nd * 8.0, (to + ship.vel * d / 600.0).normalized() + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.02, 7.0, false)
		if pr.hp <= 0.0:
			burst(n.global_position, Color(1.0, 0.6, 0.2), 200); main.sfx("explosion")
			n.queue_free(); pr.dead = true
			Game.s.units += 450; Game.toast.emit("Pirate destroyed: 450 units", "loot"); main.on_kill("pirate", n.global_position)
	pirates = pirates.filter(func(p): return not p.has("dead"))
