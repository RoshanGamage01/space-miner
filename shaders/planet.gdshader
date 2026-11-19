shader_type spatial;
// A planet seen from space: continents, seas, ice, clouds and night side.
uniform sampler3D noise : filter_linear_mipmap, repeat_enable;
uniform vec3 sea_col : source_color = vec3(0.03, 0.12, 0.25);
uniform vec3 land_a : source_color = vec3(0.2, 0.4, 0.12);
uniform vec3 land_b : source_color = vec3(0.45, 0.38, 0.25);
uniform vec3 rock_col : source_color = vec3(0.4, 0.38, 0.36);
uniform float sea_level = 0.5;
uniform float ice = 0.15;
uniform float clouds = 0.5;
uniform float lava = 0.0;
uniform vec3 seed = vec3(0.0);
varying vec3 lp;

void vertex() { lp = normalize(VERTEX); }

float fbm(vec3 p) {
	return texture(noise, p).r * 0.55 + texture(noise, p * 2.3 + 0.37).r * 0.28 + texture(noise, p * 5.9 + 0.71).r * 0.17;
}

void fragment() {
	vec3 p = lp * 0.42 + seed;
	float h = fbm(p);
	float detail = texture(noise, p * 14.0).r;
	h += (detail - 0.5) * 0.06;
	h += (texture(noise, p * 31.0).r - 0.5) * 0.03;
	float land = smoothstep(sea_level - 0.006, sea_level + 0.006, h);
	float elev = clamp((h - sea_level) / (1.0 - sea_level) * 2.2, 0.0, 1.0);
	vec3 lc = mix(land_a, land_b, smoothstep(0.15, 0.55, elev + (detail - 0.5) * 0.4));
	lc = mix(lc, rock_col, smoothstep(0.55, 0.85, elev));
	float depth = clamp((sea_level - h) * 9.0, 0.0, 1.0);
	vec3 sc = mix(sea_col * 2.2 + vec3(0.0, 0.05, 0.05), sea_col, depth);
	vec3 col = mix(sc, lc, land);
	float lat = abs(lp.y);
	float icy = smoothstep(1.0 - ice - 0.08, 1.0 - ice + 0.04, lat + (detail - 0.5) * 0.18) + smoothstep(0.8, 1.0, elev) * step(0.01, ice);
	icy = clamp(icy, 0.0, 1.0);
	col = mix(col, vec3(0.92, 0.95, 1.0), icy);
	float rough = mix(0.22, 0.9, max(land, icy));
	vec3 emis = vec3(0.0);
	if (lava > 0.5) {
		float crack = smoothstep(0.03, 0.0, abs(h - sea_level + 0.01));
		emis = vec3(1.0, 0.3, 0.04) * (1.0 - land) * (0.5 + detail) * 2.0 + vec3(1.0, 0.4, 0.05) * crack * 3.0;
		col = mix(vec3(0.03), col, land);
	}
	float cl = 0.0;
	if (clouds > 0.01) {
		vec3 cp = lp * 0.75 + seed * 1.7 + vec3(TIME * 0.0015, 0.0, TIME * 0.001);
		vec3 warp = vec3(texture(noise, cp * 0.6 + 0.3).r, texture(noise, cp * 0.6 + 0.6).r, texture(noise, cp * 0.6 + 0.9).r) - 0.5;
		cp += warp * 0.35;
		float c = texture(noise, cp).r * 0.5 + texture(noise, cp * 2.7).r * 0.3 + texture(noise, cp * 7.3).r * 0.2;
		c += sin(lp.y * 7.0 + warp.x * 5.0) * 0.035;
		cl = smoothstep(0.6 - clouds * 0.2, 0.78 - clouds * 0.2, c);
		col = mix(col, vec3(0.95, 0.97, 1.0), cl * 0.88);
		rough = mix(rough, 1.0, cl);
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = 0.4;
	EMISSION = emis;
}
