shader_type sky;
// Atmosphere, sun, layered clouds and stars for a planet surface.
uniform vec3 sky_col : source_color = vec3(0.25, 0.48, 1.0);
uniform vec3 haze_col : source_color = vec3(0.72, 0.82, 0.95);
uniform float cloud_cover = 0.5;
uniform float airless = 0.0;
uniform float time_ = 0.0;
uniform sampler2D cloud_tex : filter_linear_mipmap, repeat_enable;
uniform vec3 moon_dir = vec3(0.3, 0.5, -0.8);
uniform vec3 moon_col : source_color = vec3(0.8, 0.7, 0.6);
uniform float moon_size = 0.09;
uniform float space_fade = 0.0; // 0 on the ground, 1 in orbit

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

float cloud_d(vec2 uv) {
	float a = texture(cloud_tex, uv * 0.045 + vec2(time_ * 0.0012, 0.0)).r;
	float b = texture(cloud_tex, uv * 0.17 + vec2(time_ * 0.0031, time_ * 0.001)).r;
	float c = texture(cloud_tex, uv * 0.63 - vec2(time_ * 0.004, 0.0)).r;
	return a * 0.62 + b * 0.28 + c * 0.1;
}

void sky() {
	vec3 d = normalize(EYEDIR);
	vec3 L = normalize(LIGHT0_DIRECTION);
	float sun_h = L.y;
	float day = smoothstep(-0.12, 0.18, sun_h);
	float air = (1.0 - airless) * (1.0 - space_fade);
	float up = max(d.y, 0.0);
	float mu = dot(d, L);
	// Rayleigh-like gradient: deep colour overhead, pale haze at the horizon.
	vec3 zen = sky_col * mix(0.5, 1.0, day);
	vec3 col = mix(haze_col, zen, pow(up, 0.42));
	col = mix(col, haze_col * 0.9, pow(1.0 - up, 9.0));
	col *= mix(0.02, 1.0, day);
	// Sunset band and warm scattering around a low sun.
	float low = (1.0 - smoothstep(0.0, 0.4, abs(sun_h))) ;
	vec3 warm = vec3(1.0, 0.42, 0.14);
	col = mix(col, warm * 1.1, low * pow(1.0 - up, 3.5) * (0.35 + 0.65 * pow(max(mu, 0.0), 2.0)) * 0.85);
	// Mie glow around the sun.
	vec3 sun_c = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.96, 0.9), smoothstep(0.0, 0.35, sun_h));
	col += sun_c * (pow(max(mu, 0.0), 8.0) * 0.18 + pow(max(mu, 0.0), 90.0) * 0.5) * smoothstep(-0.1, 0.05, sun_h);
	col *= air;
	// Below the horizon: ground-coloured haze so reflections stay sane.
	if (d.y < 0.0) col = mix(col, haze_col * 0.35 * mix(0.03, 1.0, day) * air, smoothstep(0.0, -0.25, d.y));
	vec3 space = vec3(0.0);
	// Stars.
	float night = max(1.0 - day * air * 1.4, 0.0);
	if (night > 0.01 && d.y > -0.1) {
		vec3 g = floor(d * 190.0);
		float s = hash(g);
		vec3 f = fract(d * 190.0) - 0.5;
		float star = smoothstep(0.985, 1.0, s) * smoothstep(0.35, 0.0, length(f));
		vec3 tintc = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.85, 1.0), hash(g + 7.0));
		space += star * tintc * 5.0 * (0.4 + 0.6 * hash(g + 3.0));
		// Milky band.
		float band = exp(-pow(dot(d, normalize(vec3(0.4, 0.5, 0.75))) * 3.2, 2.0));
		space += band * vec3(0.055, 0.05, 0.085) * (0.5 + texture(cloud_tex, d.xz * 0.9 + d.y).r);
	}
	// A neighbouring world hanging in the sky.
	vec3 md = normalize(moon_dir);
	float ma = acos(clamp(dot(d, md), -1.0, 1.0));
	if (ma < moon_size) {
		float r = ma / moon_size;
		vec3 nrm = normalize(d - md * sqrt(max(1.0 - r * r, 0.0)) * moon_size * 1.0 - md * 0.0);
		float z = sqrt(max(1.0 - r * r, 0.0));
		vec3 side = normalize(cross(md, vec3(0.0, 1.0, 0.0))); vec3 upv = cross(side, md);
		vec3 pn = normalize(side * dot(d - md, side) / moon_size + upv * dot(d - md, upv) / moon_size - md * z);
		float lit = clamp(dot(pn, L) * 1.2 + 0.05, 0.0, 1.0);
		float tex = texture(cloud_tex, pn.xy * 0.7 + 0.2).r;
		vec3 mc = moon_col * mix(0.55, 1.1, tex) * lit;
		float edge = smoothstep(1.0, 0.94, r);
		space = mix(space, mc * 1.3, edge);
		col = mix(col, col * 0.6 + mc * 0.9, edge * (0.25 + 0.75 * night) * 0.9);
	}
	col += space * night;
	// Sun disc.
	float disc = smoothstep(0.99965, 0.99985, mu);
	col += sun_c * disc * 60.0 * smoothstep(-0.03, 0.02, d.y + 0.02);
	// Clouds: one layer with fake volume and self shadowing.
	if (cloud_cover > 0.01 && d.y > 0.005 && air > 0.01) {
		vec2 uv = d.xz / (d.y + 0.12) ;
		float dens = cloud_d(uv);
		float thr = 0.74 - cloud_cover * 0.42;
		float c = smoothstep(thr, thr + 0.2, dens);
		if (c > 0.001) {
			float toward = cloud_d(uv + L.xz * 0.35);
			float shade = clamp(1.0 - (toward - dens * 0.2) * 1.5, 0.0, 1.0);
			vec3 lit_c = mix(vec3(0.42, 0.47, 0.56) * mix(haze_col, vec3(1.0), 0.5), sun_c * 1.25, shade * shade);
			lit_c = mix(lit_c, warm * 1.4, low * 0.55 * shade);
			lit_c += sun_c * pow(max(mu, 0.0), 14.0) * 0.9 * (1.0 - c * 0.6); // silver lining
			lit_c *= mix(0.035, 1.0, day);
			float fade = smoothstep(0.005, 0.16, d.y);
			col = mix(col, lit_c, c * fade * air * 0.96);
		}
	}
	COLOR = col;
}
