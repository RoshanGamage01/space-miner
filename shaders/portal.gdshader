shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never;
uniform vec3 tint : source_color = vec3(0.6, 0.4, 1.0);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 3.1; a *= 0.5; } return s; }
void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p); float a = atan(p.y, p.x);
	float t = TIME * 0.35;
	float swirl = fbm(vec2(a * 1.6 + r * 5.0 - t * 2.0, r * 3.0 - t));
	float swirl2 = fbm(vec2(a * 3.0 - r * 7.0 + t * 1.3, r * 6.0 + t * 0.7));
	float edge = smoothstep(1.0, 0.82, r);
	float core = smoothstep(0.55, 0.0, r);
	vec3 col = tint * (0.25 + swirl * 1.3) + vec3(0.9, 0.95, 1.0) * pow(swirl2, 3.0) * 1.6 + tint * core * 0.8;
	col *= edge * (0.55 + 0.45 * smoothstep(0.0, 0.5, r));
	ALBEDO = col * 2.2;
	ALPHA = edge;
}
