class_name Atmosphere extends Node3D
## Sky, sun, moonlight, fog and the post-processing stack for a planet.

var env := Environment.new()
var sky_mat := ShaderMaterial.new()
var sun := DirectionalLight3D.new()
var moon := DirectionalLight3D.new()
var we := WorldEnvironment.new()
var biome: Dictionary
var time_of_day := 0.3 # 0..1, 0.25 sunrise, 0.5 noon
var day_length := 1500.0
var clock := 0.0
var quality := 2

func _init(b: Dictionary, q := 2) -> void:
	biome = b; quality = q
	sky_mat.shader = load("res://shaders/sky.gdshader")
	var nt := NoiseTexture2D.new()
	var fn := FastNoiseLite.new(); fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH; fn.frequency = 0.008; fn.fractal_octaves = 6; fn.fractal_gain = 0.55
	nt.noise = fn; nt.seamless = true; nt.width = 1024; nt.height = 1024; nt.generate_mipmaps = true
	sky_mat.set_shader_parameter("cloud_tex", nt)
	sky_mat.set_shader_parameter("sky_col", b.sky)
	sky_mat.set_shader_parameter("haze_col", b.haze)
	sky_mat.set_shader_parameter("cloud_cover", b.clouds)
	sky_mat.set_shader_parameter("airless", 1.0 if b.get("airless", false) else 0.0)
	var sky := Sky.new(); sky.sky_material = sky_mat
	sky.process_mode = Sky.PROCESS_MODE_REALTIME; sky.radiance_size = Sky.RADIANCE_SIZE_256
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 0.7; env.tonemap_white = 6.0
	env.glow_enabled = true; env.glow_intensity = 0.35; env.glow_bloom = 0.04; env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.set_glow_level(1, 0.3); env.set_glow_level(3, 0.8); env.set_glow_level(5, 1.0); env.set_glow_level(6, 0.6)
	env.ssao_enabled = q >= 1; env.ssao_radius = 2.2; env.ssao_intensity = 2.4; env.ssao_power = 1.6
	env.ssil_enabled = q >= 3
	env.sdfgi_enabled = q >= 2; env.sdfgi_cascades = 6; env.sdfgi_min_cell_size = 0.4; env.sdfgi_use_occlusion = true
	env.sdfgi_y_scale = Environment.SDFGI_Y_SCALE_75_PERCENT; env.sdfgi_energy = 1.0
	env.ssr_enabled = q >= 2; env.ssr_max_steps = 48
	env.fog_enabled = true; env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_aerial_perspective = 0.85; env.fog_sky_affect = 0.0
	env.fog_density = 0.00007 + b.fog * 0.004
	if b.get("airless", false): env.fog_enabled = false
	env.volumetric_fog_enabled = q >= 2 and b.fog > 0.0
	env.volumetric_fog_density = b.fog * 0.022; env.volumetric_fog_length = 420.0
	env.volumetric_fog_anisotropy = 0.6; env.volumetric_fog_detail_spread = 2.4
	env.volumetric_fog_ambient_inject = 0.6; env.volumetric_fog_sky_affect = 0.0
	env.volumetric_fog_albedo = Color(0.92, 0.94, 1.0).lerp(b.haze, 0.5)
	env.adjustment_enabled = true; env.adjustment_contrast = 1.06; env.adjustment_saturation = 1.18
	we.environment = env; add_child(we)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 420.0 if q >= 2 else 220.0
	sun.directional_shadow_split_1 = 0.045; sun.directional_shadow_split_2 = 0.14; sun.directional_shadow_split_3 = 0.4
	sun.directional_shadow_blend_splits = true
	sun.shadow_blur = 1.4; sun.light_angular_distance = 0.6; sun.shadow_bias = 0.04; sun.shadow_normal_bias = 1.6
	sun.light_volumetric_fog_energy = 0.45
	add_child(sun)
	moon.light_color = Color(0.55, 0.68, 1.0); moon.light_energy = 0.0; moon.shadow_enabled = true
	moon.directional_shadow_max_distance = 160.0; moon.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	add_child(moon)
	apply()

func _process(dt: float) -> void:
	clock += dt
	time_of_day = fposmod(time_of_day + dt / day_length, 1.0)
	apply()

func sun_dir() -> Vector3:
	var a := (time_of_day - 0.25) * TAU
	return Vector3(cos(a) * 0.82, sin(a), 0.42 * cos(a) + 0.38).normalized()

func daylight() -> float:
	return smoothstep(-0.1, 0.2, sun_dir().y)

func apply() -> void:
	var d := sun_dir()
	var day := daylight()
	sun.look_at_from_position(Vector3.ZERO, -d, Vector3.UP if absf(d.y) < 0.99 else Vector3.RIGHT)
	var warm := smoothstep(0.0, 0.3, d.y)
	sun.light_color = Color(1.0, 0.56, 0.3).lerp(Color(1.0, 0.95, 0.88), warm)
	sun.light_energy = 3.4 * smoothstep(-0.06, 0.12, d.y)
	sun.visible = sun.light_energy > 0.01
	var md := Vector3(-d.x * 0.6 + 0.3, maxf(0.35, -d.y), -d.z * 0.6 - 0.5).normalized()
	moon.look_at_from_position(Vector3.ZERO, -md, Vector3.UP)
	moon.light_energy = 0.22 * (1.0 - day)
	moon.visible = moon.light_energy > 0.005
	sky_mat.set_shader_parameter("time_", clock)
	sky_mat.set_shader_parameter("moon_dir", Vector3(0.35, 0.42, -0.84))
	env.ambient_light_energy = lerpf(0.6, 1.0, day)
	# Open up exposure at night so moonlit ground stays readable.
	env.tonemap_exposure = lerpf(2.6, 0.7, day)
	Build.warm().emission_energy_multiplier = lerpf(4.0, 1.0, day)
	env.volumetric_fog_emission = Color(0, 0, 0)
