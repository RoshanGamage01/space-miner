shader_type spatial;
render_mode cull_disabled;
// Instanced grass blades with wind; fades out by shrinking at distance.
uniform vec3 base_col : source_color = vec3(0.1, 0.22, 0.05);
uniform vec3 tip_col : source_color = vec3(0.42, 0.62, 0.2);
uniform vec3 dry_col : source_color = vec3(0.62, 0.58, 0.28);
uniform float fade_start = 55.0;
uniform float fade_end = 85.0;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
global uniform vec3 wind_dir;
global uniform vec3 player_pos;
varying float hgt;
varying float var_;

void vertex() {
	vec3 base = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float d = distance(base, CAMERA_POSITION_WORLD);
	float keep = 1.0 - smoothstep(fade_start, fade_end, d);
	hgt = UV.y;
	var_ = texture(noise_tex, base.xz * 0.011).r;
	VERTEX *= mix(vec3(1.0), vec3(1.0, 0.0, 1.0), 1.0 - keep);
	VERTEX.y *= mix(0.6, 1.5, var_);
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = TIME * 1.6;
	float wave = texture(noise_tex, wp.xz * 0.02 + wind_dir.xz * t * 0.03).r;
	float w = hgt * hgt;
	vec3 off = wind_dir * (wave - 0.35) * 0.75 * w + vec3(sin(t * 2.3 + wp.x * 1.7), 0.0, cos(t * 2.1 + wp.z * 1.9)) * 0.04 * w;
	// Bend away from the player's feet.
	vec3 away = base - player_pos; float pd = length(away);
	off += normalize(away + vec3(0.001)) * (1.0 - smoothstep(0.3, 1.4, pd)) * 0.45 * w;
	off.y -= length(off.xz) * 0.35;
	VERTEX += (inverse(MODEL_MATRIX) * vec4(off, 0.0)).xyz;
	// Light like the ground beneath so the field reads as one surface.
	NORMAL = normalize(mix(NORMAL, (inverse(MODEL_MATRIX) * vec4(0.0, 1.0, 0.0, 0.0)).xyz, 0.75));
}

void fragment() {
	vec3 tip = mix(tip_col, dry_col, smoothstep(0.45, 0.8, var_) * 0.6);
	vec3 col = mix(base_col, tip, pow(hgt, 0.8));
	ALBEDO = col;
	ROUGHNESS = 0.6;
	SPECULAR = 0.2;
	BACKLIGHT = tip * 0.55 * hgt;
	AO = mix(0.35, 1.0, hgt);
	AO_LIGHT_AFFECT = 0.7;
	if (!FRONT_FACING) NORMAL = -NORMAL;
}
