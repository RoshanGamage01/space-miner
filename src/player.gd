class_name Player extends CharacterBody3D
## The explorer on foot: movement, jetpack, first/third person camera,
## mining beam and bolt caster.

const EYE := 1.5
var world # SurfaceWorld
var cam: Camera3D
var yaw := 0.0
var pitch := 0.0
var view := "first"
var model: Node3D
var anim: AnimationPlayer
var cur_anim := ""
var body_meshes: Array = []
var health := 100.0
var shield := 60.0
var shield_delay := 0.0
var jet := 3.5
var hazard := 1.0
var tool_ := "mine"
var active := true
var dead := false
var fire_cd := 0.0
var mining := false
var aim_point := Vector3.ZERO
var aim_body: Object = null
var tool_node: Node3D
var beam: MeshInstance3D
var beam_light: OmniLight3D
var sparks: GPUParticles3D
var jet_fx: GPUParticles3D
var torch: SpotLight3D
var step_t := 0.0
var bob := 0.0
var cam_dist := 3.4

func _init(w) -> void:
	world = w
	var cs := CollisionShape3D.new(); var cap := CapsuleShape3D.new(); cap.radius = 0.34; cap.height = 1.7
	cs.shape = cap; cs.position.y = 0.85; add_child(cs)
	floor_max_angle = deg_to_rad(52); floor_snap_length = 0.4; safe_margin = 0.02
	collision_layer = 2; collision_mask = 1
	model = (load("res://assets/robot/player.glb") as PackedScene).instantiate()
	add_child(model)
	anim = model.get_node("AnimationPlayer")
	for n in ["Idle", "walking_nogun", "running_nogun", "jump_3_midair", "jump_4_falling", "walking_gun", "running_gun", "Idlecombat"]:
		if anim.has_animation(n): anim.get_animation(n).loop_mode = Animation.LOOP_LINEAR
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load("res://assets/robot/player_robot_albedo.png")
	mat.normal_enabled = true; mat.normal_texture = load("res://assets/robot/player_robot_normal.png")
	mat.orm_texture = load("res://assets/robot/player_robot_orm.png")
	mat.roughness_texture = mat.orm_texture; mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	mat.metallic = 1.0; mat.metallic_texture = mat.orm_texture; mat.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE
	mat.ao_enabled = true; mat.ao_texture = mat.orm_texture; mat.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	mat.emission_enabled = true; mat.emission_texture = load("res://assets/robot/player_robot_emissive.png"); mat.emission_energy_multiplier = 2.5
	mat.albedo_color = Game.style_color("suit")
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		body_meshes.append(mi)
		for sidx in mi.mesh.get_surface_count(): mi.set_surface_override_material(sidx, mat)
	set_meta("suit_mat", mat)
	_build_tool()
	torch = SpotLight3D.new(); torch.spot_range = 46.0; torch.spot_angle = 34.0; torch.light_energy = 0.0; torch.shadow_enabled = true
	torch.light_color = Color(0.9, 0.95, 1.0); torch.spot_attenuation = 0.8
	add_child(torch)

func _build_tool() -> void:
	tool_node = Node3D.new(); tool_node.name = "Tool"; tool_node.scale = Vector3.ONE * 0.7
	var dark := Kit.metal(Color(0.1, 0.11, 0.13), 0.4, 0.9, 3.0)
	var steel := Kit.metal(Color(0.72, 0.74, 0.78), 0.25, 1.0, 3.0)
	var orange := Kit.metal(Color(0.95, 0.45, 0.1), 0.4, 0.3, 3.0)
	Kit.inst(Kit.loft([[-0.34, 0.03, 0.035, 0, 3.0], [-0.26, 0.045, 0.055, 0, 3.0], [0.05, 0.05, 0.065, 0, 3.0], [0.16, 0.04, 0.05, -0.01, 3.0]], 16), dark, tool_node)
	Kit.inst(Kit.cyl(0.022, 0.022, 0.3, 14), steel, tool_node, Vector3(0, 0.012, -0.44), Vector3(PI / 2, 0, 0))
	for i in 4: Kit.inst(ShipModel._torus(0.03, 0.007), orange, tool_node, Vector3(0, 0.012, -0.36 - i * 0.045), Vector3(PI / 2, 0, 0))
	Kit.inst(Kit.bbox(Vector3(0.04, 0.13, 0.055), 0.012), dark, tool_node, Vector3(0, -0.1, 0.09), Vector3(0.3, 0, 0))
	Kit.inst(Kit.bbox(Vector3(0.06, 0.03, 0.2), 0.01), orange, tool_node, Vector3(0, 0.072, -0.08))
	var cell := Kit.inst(Kit.cyl(0.018, 0.018, 0.14, 12), Kit.glow(Color(0.3, 0.9, 1.0), 5.0), tool_node, Vector3(0, 0.075, -0.08), Vector3(PI / 2, 0, 0)); cell.name = "Cell"
	Kit.inst(ShipModel._sphere(0.02), Kit.glow(Color(0.3, 0.9, 1.0), 8.0), tool_node, Vector3(0, 0.012, -0.6)).name = "Muzzle"
	beam = MeshInstance3D.new(); var bm := CylinderMesh.new(); bm.top_radius = 0.012; bm.bottom_radius = 0.012; bm.height = 1.0; bm.radial_segments = 8
	beam.mesh = bm
	var bmat := StandardMaterial3D.new(); bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; bmat.albedo_color = Color(0.4, 0.95, 1.0)
	bmat.emission_enabled = true; bmat.emission = Color(0.4, 0.95, 1.0); bmat.emission_energy_multiplier = 5.0
	beam.material_override = bmat; beam.visible = false; beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	beam.top_level = true; add_child(beam)
	beam_light = OmniLight3D.new(); beam_light.light_color = Color(0.4, 0.95, 1.0); beam_light.omni_range = 7.0; beam_light.light_energy = 0.0; beam_light.top_level = true
	add_child(beam_light)
	sparks = _particles(Color(0.6, 1.0, 1.0), 60, 0.5, 3.5); sparks.top_level = true; add_child(sparks)
	jet_fx = _particles(Color(1.0, 0.7, 0.3), 50, 0.35, 5.0, Vector3.DOWN); jet_fx.position = Vector3(0, 1.0, 0.25); add_child(jet_fx)

func _particles(color: Color, amount: int, life: float, speed: float, dir := Vector3.UP) -> GPUParticles3D:
	var p := GPUParticles3D.new(); p.amount = amount; p.lifetime = life; p.emitting = false; p.local_coords = false
	var pm := ParticleProcessMaterial.new(); pm.direction = dir; pm.spread = 35.0; pm.initial_velocity_min = speed * 0.5; pm.initial_velocity_max = speed
	pm.gravity = Vector3(0, -6, 0); pm.scale_min = 0.5; pm.scale_max = 1.2
	p.process_material = pm
	var q := QuadMesh.new(); q.size = Vector2(0.03, 0.03)
	var m := Kit.spark_mat(color)
	p.visible = false
	q.material = m; p.draw_pass_1 = q
	return p

func attach_camera(c: Camera3D) -> void:
	cam = c
	if tool_node.get_parent(): tool_node.get_parent().remove_child(tool_node)
	cam.add_child(tool_node)

func look(rel: Vector2) -> void:
	var sens: float = 0.0022 * Game.s.settings.sens
	yaw -= rel.x * sens
	pitch = clampf(pitch - rel.y * sens * (-1.0 if Game.s.settings.invert_y else 1.0), -1.45, 1.45)

func forward() -> Vector3: return Vector3(-sin(yaw), 0, -cos(yaw))
func right() -> Vector3: return Vector3(cos(yaw), 0, -sin(yaw))
func aim_dir() -> Vector3: return Basis.from_euler(Vector3(pitch, yaw, 0)) * Vector3.FORWARD

func _physics_process(dt: float) -> void:
	if not active or dead:
		velocity = Vector3.ZERO
		return
	var g: float = world.desc.gravity * 1.6
	var inp := Vector2(Input.get_axis("left", "right"), Input.get_axis("back", "fwd"))
	if inp.length() > 1.0: inp = inp.normalized()
	var run := Input.is_action_pressed("run")
	var speed := 8.2 if run else 4.6
	var in_water: bool = global_position.y < world.hf.sea - 0.9 and world.has_water
	if in_water: speed *= 0.55
	var want := (forward() * inp.y + right() * inp.x) * speed
	var on := is_on_floor()
	var acc := 60.0 if on else 12.0
	velocity.x = move_toward(velocity.x, want.x, acc * dt); velocity.z = move_toward(velocity.z, want.z, acc * dt)
	var jetting := false
	if in_water:
		velocity.y = move_toward(velocity.y, 1.5 if Input.is_action_pressed("jump") else -0.6, 12.0 * dt)
	else:
		velocity.y -= g * dt
		if on and Input.is_action_just_pressed("jump"): velocity.y = 6.4; world.main.sfx("jump")
		elif not on and Input.is_action_pressed("jump") and jet > 0.0:
			velocity.y = minf(velocity.y + (g + 17.0) * dt, 8.0); jet -= dt; jetting = true
	if on and not jetting: jet = minf(Game.jet_fuel(), jet + dt * 1.7)
	jet_fx.emitting = jetting; jet_fx.visible = jetting
	var fall := velocity.y
	move_and_slide()
	# Never fall through the world.
	var gh: float = world.hf.height(global_position.x, global_position.z)
	if global_position.y < gh - 0.6: global_position.y = gh + 0.05; velocity.y = 0.0
	if is_on_floor() and fall < -19.0: hurt((-fall - 19.0) * 4.0, "fall")
	_animate(dt, inp, run, on or in_water, jetting)
	if on and inp.length() > 0.2:
		step_t -= dt * (1.6 if run else 1.0)
		if step_t <= 0.0: step_t = 0.42; world.main.sfx("step", -14.0)
	# Suit systems.
	shield_delay -= dt
	if shield_delay <= 0.0: shield = minf(Game.shield_max(), shield + dt * 9.0)
	_use_tool(dt)

func _animate(dt: float, inp: Vector2, run: bool, grounded: bool, jetting: bool) -> void:
	var moving := inp.length() > 0.15
	var name := "Idle"
	if not grounded: name = "jump_3_midair"
	elif moving: name = "running_nogun" if run else "walking_nogun"
	if name != cur_anim and anim.has_animation(name):
		anim.play(name, 0.22); cur_anim = name
	if moving or view == "first":
		var target := yaw + PI if view == "first" or not moving else atan2(-velocity.x, -velocity.z) + PI
		model.rotation.y = lerp_angle(model.rotation.y, target, minf(1.0, dt * 12.0))
	bob += dt * (inp.length() * (11.0 if run else 7.5)) if grounded else 0.0

func _use_tool(dt: float) -> void:
	fire_cd -= dt
	if Input.is_action_just_pressed("tool"):
		tool_ = "bolt" if tool_ == "mine" else "mine"
		world.main.sfx("click"); world.main.hud.flash_tool()
	var firing: bool = Input.is_action_pressed("fire") and world.main.playing()
	var from := cam.global_position; var dir := -cam.global_transform.basis.z
	var hit: Dictionary = world.raycast(from + dir * 0.3, dir, 60.0 if tool_ == "mine" else 400.0, [self])
	aim_point = hit.get("pos", from + dir * 60.0); aim_body = hit.get("body", null)
	mining = false
	if tool_ == "mine" and firing and hit.has("pos") and from.distance_to(hit.pos) < 28.0:
		mining = true
		if aim_body and aim_body.has_meta("res"):
			var r: Dictionary = world.flora.mine(aim_body, Game.mine_rate() * dt)
			if r.n > 0: world.main.on_mined(r.item, r.n)
			if r.done: world.main.sfx("break"); world.burst(hit.pos, Data.ITEMS[r.item].color)
		elif aim_body and aim_body.has_method("damage"): aim_body.damage(Game.mine_rate() * 0.35 * dt, self)
	elif tool_ == "bolt" and firing and fire_cd <= 0.0:
		fire_cd = 0.17
		var muzzle: Vector3 = tool_node.get_node("Muzzle").global_position if view == "first" else global_position + Vector3(0, 1.3, 0) + dir * 0.6
		world.shoot(muzzle, (aim_point - muzzle).normalized(), Game.bolt_damage(), true)
		world.main.sfx("shoot", -8.0)
	beam.visible = mining; sparks.emitting = mining; sparks.visible = mining
	beam_light.light_energy = 3.0 if mining else 0.0
	if mining:
		var muz: Vector3 = tool_node.get_node("Muzzle").global_position if view == "first" else global_position + Vector3(0, 1.25, 0) + right() * 0.3
		var mid := (muz + aim_point) * 0.5; var len := muz.distance_to(aim_point)
		var bd := (aim_point - muz).normalized()
		var bx := bd.cross(Vector3.UP)
		if bx.length() < 0.01: bx = Vector3.RIGHT
		bx = bx.normalized(); var bz := bx.cross(bd)
		var pulse := 1.0 + sin(Time.get_ticks_msec() * 0.03) * 0.3
		beam.global_transform = Transform3D(Basis(bx * pulse, bd * len, bz * pulse), mid)
		beam_light.global_position = aim_point - (aim_point - muz).normalized() * 0.3
		sparks.global_position = aim_point
	world.main.loop_sfx("beam", mining)

func update_camera(dt: float) -> void:
	if cam == null: return
	var head := global_position + Vector3(0, EYE, 0)
	var basis := Basis.from_euler(Vector3(pitch, yaw, 0))
	var first := view == "first"
	for mi in body_meshes:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if first else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	tool_node.visible = first and active
	if first:
		cam.global_transform = Transform3D(basis, head + Vector3(0, sin(bob) * 0.025, 0))
		var sway := Vector3(cos(bob * 0.5) * 0.006, sin(bob) * 0.008, 0)
		tool_node.position = tool_node.position.lerp(Vector3(0.26, -0.22, -0.55) + sway + (Vector3(0, 0, 0.03) if fire_cd > 0.1 else Vector3.ZERO), minf(1.0, dt * 14.0))
		tool_node.rotation = Vector3(0.02, 0.06, 0)
	else:
		var pivot := head + Vector3(0, 0.25, 0) + basis.x * 0.55
		var want := pivot + basis.z * cam_dist
		var hit: Dictionary = world.raycast(pivot, (want - pivot).normalized(), cam_dist + 0.3, [self])
		var d := cam_dist
		if hit.has("pos"): d = clampf(pivot.distance_to(hit.pos) - 0.3, 0.4, cam_dist)
		cam.global_transform = Transform3D(basis, pivot + basis.z * d)
	var night: float = 1.0 - world.atmo.daylight()
	torch.light_energy = 6.0 * smoothstep(0.55, 0.9, night)
	torch.global_transform = Transform3D(basis, head + basis.x * 0.2)
	(tool_node.get_node("Cell") as MeshInstance3D).material_override = Kit.glow(Color(0.3, 0.9, 1.0) if tool_ == "mine" else Color(1.0, 0.45, 0.2), 5.0)

func hurt(amount: float, _from = null) -> void:
	if dead: return
	shield_delay = 5.0
	var s := minf(shield, amount); shield -= s; amount -= s
	health -= amount
	world.main.hud.hurt(amount <= 0.0)
	world.main.sfx("hit", -6.0)
	if health <= 0.0: dead = true; world.main.on_death()

func damage(amount: float, from = null) -> void: hurt(amount, from)

func set_suit(c: Color) -> void:
	(get_meta("suit_mat") as StandardMaterial3D).albedo_color = c
