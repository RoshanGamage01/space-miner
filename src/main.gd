extends Node3D
## Temporary harness: build a planet and take a screenshot.

func _ready() -> void:
	var args := {}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	var type: String = args.get("biome", "lush")
	var b: Dictionary = Biomes.TYPES[type]
	var hf := Heightfield.new(int(args.get("seed", "7")), b.relief, b.sea)
	var rnd := RandomNumberGenerator.new(); rnd.seed = 5
	var spot := hf.find_flat(0, 0, rnd)
	if args.has("at"):
		var at: PackedStringArray = args.at.split(","); spot += Vector2(float(at[0]), float(at[1]))
	hf.tree_density = b.tree_density; hf.tree_max_h = minf(260.0, b.snow_line - 40.0)
	var terrain := Terrain.new(hf, b); add_child(terrain)
	var flora := Flora.new(hf, b, 7, int(args.get("q", "2"))); add_child(flora)
	var atmo := Atmosphere.new(b, int(args.get("q", "2"))); add_child(atmo)
	atmo.time_of_day = float(args.get("tod", "0.36")); atmo.apply()
	if b.sea > -100.0:
		var w := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(30000, 30000); pm.subdivide_width = 60; pm.subdivide_depth = 60
		w.mesh = pm; var wm := ShaderMaterial.new(); wm.shader = load("res://shaders/water.gdshader")
		var nt := NoiseTexture2D.new(); var fn := FastNoiseLite.new(); fn.frequency = 0.02; fn.fractal_octaves = 4
		nt.noise = fn; nt.seamless = true; nt.as_normal_map = true; nt.bump_strength = 5.0; nt.width = 512; nt.height = 512; nt.generate_mipmaps = true
		var ft := NoiseTexture2D.new(); var f2 := FastNoiseLite.new(); f2.noise_type = FastNoiseLite.TYPE_CELLULAR; f2.frequency = 0.03
		ft.noise = f2; ft.seamless = true; ft.generate_mipmaps = true
		wm.set_shader_parameter("wave_nor", nt); wm.set_shader_parameter("foam_tex", ft); wm.set_shader_parameter("deep", b.water)
		wm.set_shader_parameter("lava", 1.0 if b.get("lava", false) else 0.0)
		w.material_override = wm; w.position.y = b.sea; w.name = "Water"; add_child(w)
	var cam := Camera3D.new(); cam.far = 20000.0; cam.near = 0.15; cam.fov = 70.0
	var eye := float(args.get("eye", "1.8"))
	var yaw := deg_to_rad(float(args.get("yaw", "0")))
	cam.position = Vector3(spot.x, hf.height(spot.x, spot.y) + eye, spot.y)
	cam.rotation = Vector3(deg_to_rad(float(args.get("pitch", "-4"))), yaw, 0)
	add_child(cam); cam.make_current()
	for i in 400:
		terrain.update(cam.position); flora.update(cam.position)
		await get_tree().process_frame
		if i > 30 and terrain.pending == 0 and flora.pending == 0: break
	for i in int(args.get("frames", "40")):
		terrain.update(cam.position); flora.update(cam.position)
		await get_tree().process_frame
	var out: String = args.get("out", "shots/a.png")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://shots"))
	get_viewport().get_texture().get_image().save_png("res://" + out)
	print("SHOT ", out, " h=", cam.position.y)
	while terrain.pending > 0 or flora.pending > 0:
		terrain.update(cam.position); flora.update(cam.position)
		await get_tree().process_frame
	get_tree().quit()
