shader_type spatial;
render_mode cull_disabled, depth_draw_opaque, alpha_to_coverage;
// Leaves and plants: wind, light passing through, soft shading.
uniform sampler2D alb : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D nor : hint_normal, filter_linear_mipmap;
uniform float use_nor = 0.0;
uniform vec3 tint : source_color = vec3(1.0);
uniform float cutoff = 0.4;
uniform float wind = 1.0;
uniform float sphere_normals = 0.0;
uniform float translucency = 0.3;
uniform float height_wind = 0.0;
global uniform vec3 wind_dir;
varying float vary;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 base = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	vary = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
	float hw = pow(clamp(VERTEX.y / max(height_wind, 0.01), 0.0, 1.0), 2.0);
	float w = (height_wind > 0.0 ? hw : COLOR.r) * wind;
	float fl = height_wind > 0.0 ? hw * 0.4 : COLOR.g;
	float t = TIME * 1.3 + vary * 6.28;
	float gust = sin(TIME * 0.5 + dot(base.xz, vec2(0.05, 0.04))) * 0.5 + 0.7;
	vec3 off = wind_dir * (sin(t + wp.y * 0.3) * 0.5 + 0.35) * gust * w * 0.28;
	off += vec3(sin(t * 3.1 + wp.x * 2.0), sin(t * 2.7 + wp.z * 2.0) * 0.5, cos(t * 3.4 + wp.y * 2.0)) * fl * 0.045 * wind;
	VERTEX += (inverse(MODEL_MATRIX) * vec4(off, 0.0)).xyz;
}

void fragment() {
	vec4 c = texture(alb, UV);
	if (c.a < cutoff) discard;
	ALPHA = 1.0;
	vec3 col = c.rgb * tint * mix(0.82, 1.12, vary);
	ALBEDO = col;
	if (use_nor > 0.5) NORMAL_MAP = texture(nor, UV).rgb;
	if (sphere_normals > 0.5 && !FRONT_FACING) NORMAL = -NORMAL;
	ROUGHNESS = 0.55;
	SPECULAR = 0.25;
	BACKLIGHT = col * translucency;
	AO = height_wind > 0.0 ? 1.0 : mix(0.55, 1.0, COLOR.b);
	AO_LIGHT_AFFECT = 0.5;
}
