shader_type spatial;
render_mode cull_back;
// Blends four scanned PBR materials by slope, altitude and noise.

uniform sampler2D a_alb : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a_nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a_arm : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D b_alb : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D b_nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D b_arm : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D r_alb : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D r_nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D r_arm : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D c_alb : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D c_nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D c_arm : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 tint_a : source_color = vec3(1.0);
uniform vec3 tint_b : source_color = vec3(1.0);
uniform vec3 tint_r : source_color = vec3(1.0);
uniform float sea = 0.0;
uniform float snow_line = 300.0;
uniform float has_water = 1.0;
uniform vec3 origin_shift = vec3(0.0); // world offset of the floating origin

varying vec3 wpos;
varying vec3 wnor;
varying float forest;
uniform vec3 canopy : source_color = vec3(0.07, 0.13, 0.04);

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz + origin_shift;
	wnor = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	forest = COLOR.r;
}

struct Mat { vec3 alb; vec3 nor; vec3 arm; };

Mat planar(sampler2D alb, sampler2D nor, sampler2D arm, vec2 uv, float far) {
	Mat m;
	vec2 u1 = uv * 0.26; vec2 u2 = uv * 0.031 + vec2(0.37, 0.11);
	vec3 a1 = texture(alb, u1).rgb; vec3 a2 = texture(alb, u2).rgb;
	// Far scale carries the colour at distance; near scale the detail up close.
	m.alb = mix(a1 * mix(vec3(1.0), a2 * 2.2, 0.45), a2, far);
	m.nor = mix(texture(nor, u1).rgb, texture(nor, u2).rgb, far) * 2.0 - 1.0;
	m.arm = mix(texture(arm, u1).rgb, texture(arm, u2).rgb, far);
	return m;
}

void fragment() {
	vec3 n = normalize(wnor);
	float dist = length(VERTEX);
	float far = smoothstep(18.0, 140.0, dist);
	float h = wpos.y;
	float n1 = texture(noise_tex, wpos.xz * 0.0021).r;
	float n2 = texture(noise_tex, wpos.xz * 0.019 + 0.3).r;
	float n3 = texture(noise_tex, wpos.xz * 0.00031 + 0.7).r;

	float slope = 1.0 - n.y;
	float w_rock = smoothstep(0.16, 0.34, slope + (n2 - 0.5) * 0.16);
	float w_c = has_water * (1.0 - smoothstep(sea + 0.6, sea + 4.5 + n2 * 3.0, h));
	float w_b = smoothstep(0.5, 0.72, n1 * 0.35 + n2 * 0.25 + slope * 0.9 + forest * 0.42);

	Mat m = planar(a_alb, a_nor, a_arm, wpos.xz, far);
	m.alb *= tint_a;
	if (w_b > 0.01) {
		Mat b = planar(b_alb, b_nor, b_arm, wpos.xz, far);
		m.alb = mix(m.alb, b.alb * tint_b, w_b); m.nor = mix(m.nor, b.nor, w_b); m.arm = mix(m.arm, b.arm, w_b);
	}
	if (w_c > 0.01) {
		Mat c = planar(c_alb, c_nor, c_arm, wpos.xz, far);
		m.alb = mix(m.alb, c.alb, w_c); m.nor = mix(m.nor, c.nor, w_c); m.arm = mix(m.arm, c.arm, w_c);
	}
	vec3 wn = normalize(vec3(n.x + m.nor.x, n.y, n.z - m.nor.y));
	if (w_rock > 0.01) {
		// Rock is projected from the sides so cliffs do not stretch.
		vec3 bw = abs(n); bw = pow(bw, vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
		float s1 = 0.11; float s2 = 0.017;
		vec2 ux = wpos.zy; vec2 uz = wpos.xy; vec2 uy = wpos.xz;
		vec3 alb = vec3(0.0); vec3 arm = vec3(0.0); vec3 rn = vec3(0.0);
		for (int i = 0; i < 3; i++) {
			float w = i == 0 ? bw.x : (i == 1 ? bw.z : bw.y);
			if (w < 0.02) continue;
			vec2 uv = i == 0 ? ux : (i == 1 ? uz : uy);
			vec3 c1 = texture(r_alb, uv * s1).rgb; vec3 c2 = texture(r_alb, uv * s2).rgb;
			alb += w * mix(c1 * mix(vec3(1.0), c2 * 2.4, 0.5), c2, far);
			arm += w * mix(texture(r_arm, uv * s1).rgb, texture(r_arm, uv * s2).rgb, far);
			vec3 t = mix(texture(r_nor, uv * s1).rgb, texture(r_nor, uv * s2).rgb, far * 0.8) * 2.0 - 1.0;
			t.xy *= 1.4;
			if (i == 0) rn += w * vec3(n.x, n.y + t.y, n.z + t.x);
			else if (i == 1) rn += w * vec3(n.x + t.x, n.y + t.y, n.z);
			else rn += w * vec3(n.x + t.x, n.y, n.z - t.y);
		}
		m.alb = mix(m.alb, alb * tint_r, w_rock); m.arm = mix(m.arm, arm, w_rock);
		wn = normalize(mix(wn, normalize(rn), w_rock));
	}
	// Large-scale colour variation so the land never looks tiled.
	m.alb *= mix(0.72, 1.22, n3) * mix(0.9, 1.1, n1);
	// Distant forest reads as dark canopy once individual trees are out of range.
	float can = forest * smoothstep(700.0, 1300.0, dist) * (1.0 - w_rock) * smoothstep(0.3, 0.6, forest + n2 * 0.3);
	m.alb = mix(m.alb, canopy * mix(0.7, 1.3, n2), can * 0.85);
	// Snow on high, flat ground.
	float snow = smoothstep(snow_line - 30.0, snow_line + 40.0, h + (n1 - 0.5) * 90.0) * smoothstep(0.62, 0.3, slope);
	m.alb = mix(m.alb, vec3(0.9, 0.93, 0.97), snow);
	m.arm = mix(m.arm, vec3(1.0, 0.55, 0.0), snow);
	wn = normalize(mix(wn, n, snow * 0.7));
	// Wet shore.
	float wet = has_water * (1.0 - smoothstep(sea - 0.5, sea + 1.2, h));
	m.alb *= mix(1.0, 0.55, wet);
	ALBEDO = m.alb;
	ROUGHNESS = mix(clamp(m.arm.g, 0.05, 1.0), 0.25, wet);
	AO = m.arm.r;
	AO_LIGHT_AFFECT = 0.4;
	METALLIC = 0.0;
	SPECULAR = 0.35;
	NORMAL = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);
}
