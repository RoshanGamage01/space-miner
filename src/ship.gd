class_name Ship extends Node3D
## The player's starship. Works on a planet (world gives ground height) and
## in space. Arcade flight: mouse steers, W/S throttle, Shift boosts.

var world
var model: Node3D
var body := StaticBody3D.new()
var state := "landed" # landed, lifting, flying, landing, docked
var vel := Vector3.ZERO
var throttle := 0.0
var hull := 300.0
var view := "third"
var piloted := false
var steer := Vector2.ZERO
var fire_cd := 0.0
var land_y := 0.0
var in_space := false
var boost := false
var speed := 0.0
var alt := 0.0
var nozzle_mat: StandardMaterial3D
var lights: Array = []
var trail: GPUParticles3D
var shake := 0.0

func _init(w, space := false) -> void:
	world = w; in_space = space
	model = ShipModel.build(Game.style_color("paint")); add_child(model)
	var cs := CollisionShape3D.new(); var bx := BoxShape3D.new(); bx.size = Vector3(3.2, 1.9, 10.0); cs.shape = bx; cs.position = Vector3(0, 0.3, -0.8)
	body.add_child(cs)
	var cs2 := CollisionShape3D.new(); var bx2 := BoxShape3D.new(); bx2.size = Vector3(10.8, 0.5, 3.2); cs2.shape = bx2; cs2.position = Vector3(0, 0.1, 1.8)
	body.add_child(cs2); add_child(body)
	body.set_meta("ship", true)
	nozzle_mat = Kit.glow(Color(0.35, 0.8, 1.0), 2.0).duplicate()
	for n in model.find_children("Nozzle", "MeshInstance3D", true, false): n.material_override = nozzle_mat
	lights = model.find_children("EngineLight", "OmniLight3D", true, false)
	hull = Game.ship_hull()

func damage(amount: float, _from = null) -> void:
	hull -= amount; shake = 0.4
	world.main.hud.hurt(false)
	if hull <= 0.0: world.main.on_ship_destroyed()

func forward() -> Vector3: return -global_transform.basis.z
func up() -> Vector3: return global_transform.basis.y

func look(rel: Vector2) -> void:
	steer += rel * 0.0016 * Game.s.settings.sens
	steer = steer.limit_length(1.0)

func board() -> void:
	piloted = true; steer = Vector2.ZERO
	body.process_mode = Node.PROCESS_MODE_DISABLED if false else Node.PROCESS_MODE_INHERIT

func tick(dt: float) -> void:
	var gy: float = world.ground_at(global_position.x, global_position.z)
	alt = global_position.y - gy if not in_space else 1e6
	fire_cd -= dt; shake = maxf(0.0, shake - dt)
	var want_glow := 0.3
	match state:
		"landed", "docked":
			vel = Vector3.ZERO; throttle = 0.0
			if piloted and state == "landed" and Input.is_action_pressed("fwd"):
				state = "lifting"; land_y = global_position.y + 14.0; world.main.sfx("launch"); world.main.on_takeoff()
		"lifting":
			want_glow = 6.0
			global_position.y = move_toward(global_position.y, land_y, dt * 7.0)
			rotation.x = lerp_angle(rotation.x, 0.0, dt * 2.0); rotation.z = lerp_angle(rotation.z, 0.0, dt * 2.0)
			if global_position.y >= land_y - 0.2: state = "flying"; throttle = 0.35; vel = forward() * 20.0
		"landing":
			want_glow = 3.0
			var target := gy + 1.42
			vel = vel.lerp(Vector3.ZERO, minf(1.0, dt * 2.0))
			global_position += vel * dt
			global_position.y = move_toward(global_position.y, target, dt * clampf((global_position.y - target) * 0.9, 3.0, 60.0))
			var flat := Basis(Vector3.UP, rotation.y)
			global_transform.basis = global_transform.basis.slerp(flat, minf(1.0, dt * 2.5)).orthonormalized()
			if global_position.y <= target + 0.03:
				state = "landed"; rotation.x = 0.0; rotation.z = 0.0
				world.main.sfx("land"); world.main.on_landed()
		"flying":
			_fly(dt, gy)
			want_glow = 0.8 + throttle * 5.0 + (6.0 if boost else 0.0)
	nozzle_mat.emission_energy_multiplier = lerpf(nozzle_mat.emission_energy_multiplier, want_glow, minf(1.0, dt * 5.0))
	for l in lights: l.light_energy = nozzle_mat.emission_energy_multiplier * 0.5
	speed = vel.length()

func _fly(dt: float, gy: float) -> void:
	if piloted:
		throttle = clampf(throttle + (Input.get_axis("back", "fwd")) * dt * 0.6, 0.0, 1.0)
		if Input.is_action_just_pressed("brake"): throttle = 0.0
		boost = Input.is_action_pressed("run") and throttle > 0.1
		var roll := Input.get_axis("right", "left")
		var b := global_transform.basis
		b = b.rotated(b.x, -steer.y * dt * 1.5).rotated(b.y, -steer.x * dt * 1.2).rotated(b.z, roll * dt * 1.8)
		if not in_space:
			# Gently level the wings when the stick is centred.
			var lvl := b.x.dot(Vector3.UP)
			b = b.rotated(b.z, -lvl * dt * 1.2 * (1.0 - absf(roll)))
		global_transform.basis = b.orthonormalized()
		steer = steer.lerp(Vector2.ZERO, minf(1.0, dt * 2.2))
		if Input.is_action_pressed("fire") and fire_cd <= 0.0 and world.main.playing():
			fire_cd = 0.13
			for side in [-0.62, 0.62]:
				var from := to_global(Vector3(side, -0.12, -4.6))
				world.shoot(from, forward(), Game.ship_damage(), true, 420.0 + speed)
			world.main.sfx("shoot", -10.0)
		if Input.is_action_just_pressed("land") and not in_space and alt < 500.0:
			state = "landing"; world.main.sfx("click")
	var top := (1500.0 if boost else 420.0) if in_space else (360.0 if boost else 150.0)
	# Slow down near the ground so landings are not a lottery.
	if not in_space: top *= clampf(alt / 220.0, 0.35, 1.0)
	var want := forward() * throttle * top
	vel = vel.lerp(want, minf(1.0, dt * (1.4 if in_space else 2.0)))
	global_position += vel * dt
	if not in_space:
		var floor_y := gy + 2.4
		if global_position.y < floor_y:
			if vel.length() > 55.0: damage(vel.length() * 0.5); world.burst(global_position, Color(1, 0.6, 0.2), 60)
			global_position.y = floor_y
			vel.y = maxf(vel.y, 0.0); vel *= 0.92

func update_camera(dt: float, cam: Camera3D) -> void:
	var b := global_transform.basis
	var jitter := Vector3(randf() - 0.5, randf() - 0.5, 0) * (shake * 0.3 + (0.02 if boost else 0.0))
	(model.get_node("Canopy") as MeshInstance3D).visible = view != "first"
	if view == "first":
		cam.global_transform = Transform3D(b, to_global(Vector3(0, 1.12, -1.75) + jitter))
	else:
		var back := 15.0 + speed * (0.004 if in_space else 0.02)
		var want := global_position + b.z * back + b.y * 3.6
		var t := Transform3D(b, want).looking_at(global_position - b.z * 14.0 + b.y * 1.0, b.y)
		cam.global_transform = cam.global_transform.interpolate_with(t, minf(1.0, dt * 7.0))
		cam.global_position = want + b * jitter
		if not in_space:
			var gy: float = world.ground_at(cam.global_position.x, cam.global_position.z) + 1.0
			if cam.global_position.y < gy: cam.global_position.y = gy
	cam.fov = lerpf(cam.fov, Game.s.settings.fov + (14.0 if boost else 0.0) + throttle * 4.0, minf(1.0, dt * 3.0))

func set_paint(c: Color) -> void:
	var old := model
	model = ShipModel.build(c); add_child(model); old.queue_free()
	for n in model.find_children("Nozzle", "MeshInstance3D", true, false): n.material_override = nozzle_mat
	lights = model.find_children("EngineLight", "OmniLight3D", true, false)
