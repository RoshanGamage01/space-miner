shader_type spatial;
render_mode blend_add, cull_front, unshaded, depth_draw_never;
// Glowing limb of a planet's atmosphere, brightest on the sunlit edge.
uniform vec3 tint : source_color = vec3(0.3, 0.55, 1.0);
uniform vec3 sun_dir = vec3(0.0, 0.0, 1.0);
varying vec3 wn;
void vertex() { wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz); }
void fragment() {
	float f = pow(clamp(dot(normalize(NORMAL), normalize(VIEW)) * -1.0, 0.0, 1.0), 1.0);
	float rim = smoothstep(0.0, 0.5, f) * pow(1.0 - f, 2.2) * 5.0;
	float lit = smoothstep(-0.35, 0.5, dot(-wn, normalize(sun_dir)));
	ALBEDO = tint * rim * lit * 1.6;
	ALPHA = clamp(rim * lit, 0.0, 1.0);
}
