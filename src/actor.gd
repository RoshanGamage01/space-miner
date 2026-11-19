class_name Actor extends Node3D
## Characters in the world: townsfolk, traders, hostile machines, the Warden.

var world
var kind := "npc" # npc, rogue, sentinel, warden
var role := ""
var faction := ""
var display := ""
var hp := 60.0
var max_hp := 60.0
var home := Vector3.ZERO
var model: Node3D
var anim: AnimationPlayer
var body := StaticBody3D.new()
var cur := ""
var target := Vector3.ZERO
var wait := 0.0
var fire_t := 2.0
var hostile := false
var dead := false
var alert := false
var speed := 1.3
var scale_ := 1.0
var bar: MeshInstance3D
var hit_flash := 0.0

static func _robot_mat(tint: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load("res://assets/robot/player_robot_albedo.png"); mat.albedo_color = tint
	mat.normal_enabled = true; mat.normal_texture = load("res://assets/robot/player_robot_normal.png")
	var orm: Texture2D = load("res://assets/robot/player_robot_orm.png")
	mat.roughness_texture = orm; mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	mat.metallic = 1.0; mat.metallic_texture = orm; mat.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE
	mat.ao_enabled = true; mat.ao_texture = orm; mat.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	mat.emission_enabled = true; mat.emission_texture = load("res://assets/robot/player_robot_emissive.png"); mat.emission_energy_multiplier = 2.5
	return mat

static func _enemy_mat(tint: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load("res://assets/enemy/red_robot_albedo.png"); mat.albedo_color = tint
	mat.normal_enabled = true; mat.normal_texture = load("res://assets/enemy/red_robot_normal.png")
	var orm: Texture2D = load("res://assets/enemy/red_robot_orm.png")
	mat.roughness_texture = orm; mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	mat.metallic = 1.0; mat.metallic_texture = orm; mat.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE
	mat.ao_enabled = true; mat.ao_texture = orm; mat.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	mat.emission_enabled = true; mat.emission_texture = load("res://assets/enemy/red_robot_emission.png"); mat.emission_energy_multiplier = 3.0
	return mat

func _init(w, kind_: String, pos: Vector3, opts := {}) -> void:
	world = w; kind = kind_; home = pos
	role = opts.get("role", ""); faction = opts.get("faction", ""); display = opts.get("name", "")
	hostile = kind != "npc"
	var mat: StandardMaterial3D
	if kind == "npc":
		model = (load("res://assets/robot/player.glb") as PackedScene).instantiate()
		var fc: Color = Data.FACTIONS[faction].color if Data.FACTIONS.has(faction) else Color.WHITE
		mat = _robot_mat(Color.WHITE.lerp(fc, opts.get("tint", 0.55)))
		scale_ = opts.get("scale", 1.0); hp = 9999.0
	else:
		model = (load("res://assets/enemy/red_robot.glb") as PackedScene).instantiate()
		var tint := Color.WHITE
		if kind == "sentinel": tint = Color(0.55, 0.75, 1.0)
		if kind == "warden": tint = Color(0.7, 0.45, 1.0)
		mat = _enemy_mat(tint)
		scale_ = {"rogue": 0.62, "sentinel": 0.7, "warden": 2.0}[kind]
		hp = {"rogue": 80.0, "sentinel": 110.0, "warden": 1400.0}[kind]
		speed = {"rogue": 2.6, "sentinel": 2.2, "warden": 3.2}[kind]
	max_hp = hp
	model.scale = Vector3.ONE * scale_
	add_child(model)
	anim = model.get_node("AnimationPlayer")
	for a in ["Idle", "walking_nogun", "Walk"]:
		if anim.has_animation(a): anim.get_animation(a).loop_mode = Animation.LOOP_LINEAR
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		for sidx in mi.mesh.get_surface_count(): mi.set_surface_override_material(sidx, mat)
	set_meta("mat", mat)
	var cs := CollisionShape3D.new()
	if kind == "npc":
		var cap := CapsuleShape3D.new(); cap.radius = 0.4; cap.height = 1.8; cs.shape = cap; cs.position.y = 0.9
	else:
		var sph := SphereShape3D.new(); sph.radius = 1.5 * scale_; cs.shape = sph; cs.position.y = 1.2 * scale_
	body.add_child(cs); add_child(body)
	position = pos; target = pos
	rotation.y = randf() * TAU
	_play("Idle")

func _play(n: String) -> void:
	if n == "walk": n = "walking_nogun" if kind == "npc" else "Walk"
	if cur == n or not anim.has_animation(n): return
	cur = n; anim.play(n, 0.25)

func _face(to: Vector3, dt: float, rate := 4.0) -> void:
	var d := to - global_position; d.y = 0
	if d.length() < 0.05: return
	rotation.y = lerp_angle(rotation.y, atan2(d.x, d.z), minf(1.0, dt * rate))

func tick(dt: float) -> void:
	if dead: return
	var mat: StandardMaterial3D = get_meta("mat")
	hit_flash = maxf(0.0, hit_flash - dt * 4.0)
	mat.emission_energy_multiplier = 3.0 + hit_flash * 20.0
	var pl: Vector3 = world.player.global_position if world.main.mode == "foot" else world.ship.global_position
	var dist := global_position.distance_to(pl)
	if dist > 420.0: return
	if kind == "npc": _npc(dt, pl, dist)
	else: _hostile(dt, pl, dist)
	global_position.y = world.hf.height(global_position.x, global_position.z)

func _npc(dt: float, pl: Vector3, dist: float) -> void:
	if dist < 5.5 or role != "":
		_play("Idle")
		if dist < 9.0: _face(pl, dt)
		return
	wait -= dt
	var d := target - global_position; d.y = 0
	if d.length() < 0.4:
		_play("Idle")
		if wait <= 0.0:
			wait = randf_range(3.0, 9.0)
			var a := randf() * TAU
			target = home + Vector3(cos(a), 0, sin(a)) * randf_range(2.0, 9.0)
	else:
		_play("walk"); _face(target, dt)
		global_position += d.normalized() * speed * dt

func _hostile(dt: float, pl: Vector3, dist: float) -> void:
	var see := 95.0 if kind != "warden" else 220.0
	if dist < see or alert:
		alert = dist < see * 2.2
		_face(pl, dt, 3.0)
		var keep := 16.0 if kind != "warden" else 30.0
		var d := pl - global_position; d.y = 0
		if dist > keep + 4.0 and global_position.distance_to(home) < 160.0:
			_play("walk"); global_position += d.normalized() * speed * dt
		else: _play("Idle")
		fire_t -= dt
		if fire_t <= 0.0 and dist < see:
			var n := 1 if kind != "warden" else 5
			fire_t = randf_range(1.3, 2.2) if kind != "warden" else (0.9 if hp < max_hp * 0.4 else 1.5)
			var from := global_position + Vector3(0, 1.5 * scale_, 0) + (pl - global_position).normalized() * 1.6 * scale_
			var aim: Vector3 = pl + Vector3(0, 1.0, 0) + (world.player.velocity * dist / 70.0 if world.main.mode == "foot" else world.ship.vel * dist / 70.0) * 0.6
			for i in n:
				var dir: Vector3 = (aim - from).normalized()
				if n > 1: dir = dir.rotated(Vector3.UP, (i - (n - 1) * 0.5) * 0.09)
				dir = (dir + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.035).normalized()
				world.shoot(from, dir, 9.0 if kind != "warden" else 14.0, false, 70.0, Color(1.0, 0.3, 0.15) if kind != "warden" else Color(0.75, 0.4, 1.0))
			if anim.has_animation("Cannon_Fire_Recoil"): anim.play("Cannon_Fire_Recoil", 0.05); cur = ""
			world.main.sfx("enemy_shoot", -6.0 - dist * 0.12)
	else:
		_play("Idle")
		wait -= dt
		if wait <= 0.0:
			wait = randf_range(2.0, 6.0); rotation.y += randf_range(-1.0, 1.0)
	if kind == "warden": world.main.hud.boss("THE WARDEN", hp / max_hp if (alert or dist < see) else 0.0)

func damage(amount: float, _from = null) -> void:
	if dead or kind == "npc": return
	hp -= amount; alert = true; hit_flash = 1.0
	if hp <= 0.0:
		dead = true
		world.burst(global_position + Vector3(0, 1.2 * scale_, 0), Color(1.0, 0.6, 0.2), 120)
		world.main.sfx("explosion", -4.0)
		if kind == "warden": world.main.hud.boss("", 0.0)
		world.main.on_kill(kind, global_position)
		queue_free()
