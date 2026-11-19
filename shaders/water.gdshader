shader_type spatial;
render_mode cull_disabled, depth_draw_always, specular_schlick_ggx;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D wave_nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D foam_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 deep : source_color = vec3(0.02, 0.16, 0.2);
uniform float lava = 0.0;
uniform float clarity = 9.0;
varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float t = TIME;
	float dist = length(VERTEX);
	vec2 uv = wpos.xz;
	float sp = mix(1.0, 0.15, lava);
	vec3 n1 = texture(wave_nor, uv * 0.045 + vec2(t * 0.018, t * 0.011) * sp).rgb * 2.0 - 1.0;
	vec3 n2 = texture(wave_nor, uv * 0.012 - vec2(t * 0.009, t * 0.014) * sp).rgb * 2.0 - 1.0;
	vec3 n3 = texture(wave_nor, uv * 0.21 + vec2(-t * 0.03, t * 0.025) * sp).rgb * 2.0 - 1.0;
	float near = 1.0 - smoothstep(30.0, 260.0, dist);
	vec2 nn = n1.xy * 0.55 + n2.xy * 0.75 + n3.xy * 0.4 * near;
	nn *= mix(1.0, 0.35, smoothstep(300.0, 3000.0, dist));
	vec3 wn = normalize(vec3(nn.x, 1.6, nn.y));
	NORMAL = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);

	float zraw = texture(depth_tex, SCREEN_UV).r;
	vec4 up = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, zraw, 1.0);
	float scene_z = -up.z / up.w;
	float thick = max(scene_z + VERTEX.z, 0.0);
	// Refraction: offset the background by the wave normal, but never sample in front of the surface.
	vec2 ruv = SCREEN_UV + nn * 0.035 * clamp(thick * 0.4, 0.0, 1.0) / (1.0 + dist * 0.02);
	float z2 = texture(depth_tex, ruv).r;
	vec4 up2 = INV_PROJECTION_MATRIX * vec4(ruv * 2.0 - 1.0, z2, 1.0);
	if (-up2.z / up2.w < -VERTEX.z) ruv = SCREEN_UV; else thick = max(-up2.z / up2.w + VERTEX.z, 0.0);
	vec3 bg = texture(screen_tex, ruv).rgb;
	float fogf = 1.0 - exp(-thick / clarity);
	vec3 shallow = deep * 3.2 + vec3(0.0, 0.07, 0.06);
	vec3 col = mix(bg * mix(vec3(1.0), shallow * 2.4, clamp(thick * 0.6, 0.0, 0.8)), deep, fogf);
	// Foam where water meets land.
	float f = texture(foam_tex, uv * 0.09 + nn * 0.05 + vec2(t * 0.02, 0.0)).r;
	float foam = smoothstep(1.3, 0.0, thick) * smoothstep(0.35, 0.75, f + (1.0 - clamp(thick, 0.0, 1.0)) * 0.5) * (1.0 - lava);
	col = mix(col, vec3(0.92), foam * 0.85);
	if (lava > 0.5) {
		float crust = texture(foam_tex, uv * 0.02 + nn * 0.02).r;
		float glow = smoothstep(0.42, 0.7, crust + n2.x * 0.1);
		col = mix(vec3(0.03, 0.02, 0.02), vec3(1.0, 0.3, 0.03), glow);
		EMISSION = vec3(1.0, 0.28, 0.03) * glow * 5.0;
		ROUGHNESS = mix(0.9, 0.5, glow);
	} else {
		ROUGHNESS = mix(0.04, 0.3, foam);
	}
	ALBEDO = col * (1.0 - lava) + col * lava;
	// Background already lit: keep the surface from being lit twice.
	float fres = pow(1.0 - clamp(dot(normalize(VIEW), NORMAL), 0.0, 1.0), 5.0);
	if (lava < 0.5) { EMISSION = col * (1.0 - fres) * 0.92; ALBEDO = col * 0.08; }
	METALLIC = 0.0;
	SPECULAR = 0.6;
}
