// GLSL for the sky and planets: ray-marched atmospheric scattering, animated
// water, volumetric-looking cloud shell, nebula backdrop and the sun.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

const LOGDEPTH_VERT_PARS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;

// ------------------------------------------------------------ atmosphere
// Single scattering (Rayleigh + Mie) integrated along the view ray. Drawn on
// a shell: back faces when the camera is inside (the sky), front faces from
// space (the glowing limb and haze over the surface).
export function atmosphereMaterial({ radius, top, tint, inside, steps = 14, lsteps = 5 }) {
  const t = new THREE.Vector3(tint[0], tint[1], tint[2]);
  // Wavelength-dependent scattering shaped by the planet's sky tint.
  const beta = new THREE.Vector3(0.25 + t.x * 0.9, 0.3 + t.y * 1.3, 0.35 + t.z * 2.2).multiplyScalar(0.42 / (top - radius));
  return new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uR: { value: radius },
      uRa: { value: top },
      uBetaR: { value: beta },
      uBetaM: { value: 0.35 / (top - radius) },
      uSunI: { value: 15 },
      uInside: { value: inside ? 1 : 0 },
      uCamInside: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCenter, uSun, uBetaR; uniform float uR, uRa, uBetaM, uSunI, uInside, uCamInside;
      varying vec3 vWorld;
      vec2 sphere(vec3 o, vec3 d, float r){ float b = dot(o,d); float c = dot(o,o) - r*r; float h = b*b - c; if(h < 0.0) return vec2(1e9,-1e9); h = sqrt(h); return vec2(-b-h, -b+h); }
      void main(){
        #include <logdepthbuf_fragment>
        if (uInside > 0.5 && uCamInside < 0.5) discard;
        if (uInside < 0.5 && uCamInside > 0.5) discard;
        vec3 ro = cameraPosition - uCenter;
        vec3 rd = normalize(vWorld - cameraPosition);
        vec2 ta = sphere(ro, rd, uRa);
        if (ta.x > ta.y) discard;
        float t0 = max(ta.x, 0.0), t1 = ta.y;
        vec2 tp = sphere(ro, rd, uR * 0.999);
        bool ground = tp.x < tp.y && tp.x > 0.0;
        if (ground) t1 = min(t1, tp.x);
        float H = uRa - uR;
        float hR = H * 0.22, hM = H * 0.07;
        const int STEPS = ${steps}; const int LSTEPS = ${lsteps};
        float dt = (t1 - t0) / float(STEPS);
        vec3 sumR = vec3(0.0); float sumM = 0.0; float odR = 0.0, odM = 0.0;
        for (int i = 0; i < STEPS; i++){
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * dt);
          float h = length(p) - uR;
          float dR = exp(-max(h,0.0)/hR) * dt, dM = exp(-max(h,0.0)/hM) * dt;
          odR += dR; odM += dM;
          vec2 tl = sphere(p, uSun, uRa);
          vec2 tg = sphere(p, uSun, uR * 0.995);
          float shadow = (tg.x < tg.y && tg.x > 0.0) ? 0.0 : 1.0;
          float dl = tl.y / float(LSTEPS); float lR = 0.0, lM = 0.0;
          for (int j = 0; j < LSTEPS; j++){
            vec3 q = p + uSun * ((float(j) + 0.5) * dl);
            float hq = max(length(q) - uR, 0.0);
            lR += exp(-hq/hR) * dl; lM += exp(-hq/hM) * dl;
          }
          vec3 att = exp(-(uBetaR * (odR + lR) + uBetaM * 1.1 * (odM + lM)));
          sumR += dR * att * shadow; sumM += dM * (att.r+att.g+att.b)/3.0 * shadow;
        }
        float mu = dot(rd, uSun);
        float pR = 3.0 / (16.0 * PI) * (1.0 + mu*mu);
        float g = 0.76; float pM = 3.0 / (8.0 * PI) * ((1.0 - g*g) * (1.0 + mu*mu)) / ((2.0 + g*g) * pow(1.0 + g*g - 2.0*g*mu, 1.5));
        vec3 col = uSunI * (sumR * uBetaR * pR + sumM * uBetaM * pM);
        vec3 trans = exp(-(uBetaR * odR + uBetaM * odM));
        float alpha = clamp(1.0 - (trans.r + trans.g + trans.b) / 3.0, 0.0, 1.0);
        // Seen from space the haze is a thin veil, not a fog bank.
        if (uInside < 0.5) { col *= 0.5; alpha *= ground ? 0.55 : 0.9; }
        gl_FragColor = vec4(col, alpha);
      }`,
    side: inside ? THREE.BackSide : THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

// ------------------------------------------------------------ water / lava
export function waterMaterial({ color, lava, sky }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uColor: { value: new THREE.Vector3(...color) },
      uSky: { value: new THREE.Vector3(...sky) },
      uLava: { value: lava ? 1 : 0 },
      uDay: { value: 1 },
    },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vLocal; varying vec3 vWorld;
      void main(){
        vLocal = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uLava, uDay; uniform vec3 uSun, uColor, uSky;
      varying vec3 vLocal; varying vec3 vWorld;
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vLocal);
        vec3 v = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        if (uLava > 0.5) {
          float f = fbm(vLocal * 0.02 + vec3(0.0, uTime * 0.02, 0.0));
          float crack = smoothstep(0.42, 0.62, fbm(vLocal * 0.06 - vec3(uTime * 0.03)));
          vec3 col = mix(vec3(0.05, 0.01, 0.0), vec3(3.5, 0.9, 0.08), crack * (0.6 + 0.4 * f));
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        // Ripples fade with distance so the far ocean stays calm.
        float amp = 0.35 / (1.0 + dist * 0.01);
        vec3 p = vLocal * 0.25;
        float e = 0.6;
        float h0 = fbm(p + vec3(uTime * 0.25, uTime * 0.18, 0.0));
        vec3 grad = vec3(fbm(p + vec3(e,0,0) + vec3(uTime*0.25, uTime*0.18, 0.0)) - h0, fbm(p + vec3(0,e,0) + vec3(uTime*0.25, uTime*0.18, 0.0)) - h0, fbm(p + vec3(0,0,e) + vec3(uTime*0.25, uTime*0.18, 0.0)) - h0);
        n = normalize(n - grad * amp * 4.0);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        float ndl = max(dot(normalize(vLocal), uSun), 0.0);
        float day = smoothstep(-0.05, 0.25, dot(normalize(vLocal), uSun));
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, uSun), 0.0), 220.0) * 6.0 * day;
        vec3 skyCol = uSky * (0.25 + 0.75 * day);
        vec3 col = mix(uColor * (0.25 + 0.75 * ndl), skyCol, 0.15 + fres * 0.75) + vec3(1.0, 0.95, 0.85) * spec;
        gl_FragColor = vec4(col, mix(0.82, 0.97, fres));
      }`,
    transparent: !lava,
  });
}

// ------------------------------------------------------------ clouds
export function cloudMaterial({ cover, seed }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uCover: { value: cover }, uSeed: { value: seed % 100 } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec3 vLocal; varying vec3 vWorld;
      void main(){
        vLocal = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uCover, uSeed; uniform vec3 uSun;
      varying vec3 vLocal; varying vec3 vWorld;
      ${NOISE}
      void main(){
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vLocal);
        vec3 p = n * 5.0 + vec3(uSeed, uTime * 0.004, uTime * 0.006);
        float d = fbm(p) * 0.65 + fbm(p * 3.1 + 5.0) * 0.35;
        float th = 0.7 - uCover * 0.3;
        float a = smoothstep(th, th + 0.16, d);
        if (a < 0.01) discard;
        float lit = smoothstep(-0.25, 0.5, dot(n, uSun));
        float dens = fbm(p + uSun * 0.12);
        vec3 col = mix(vec3(0.42, 0.48, 0.6), vec3(0.92), 1.0 - dens * 0.7) * (0.05 + lit * 0.8);
        col += vec3(1.0, 0.55, 0.3) * pow(1.0 - abs(dot(n, uSun)), 6.0) * 0.5 * lit;
        float fade = smoothstep(0.0, 40.0, length(cameraPosition - vWorld));
        gl_FragColor = vec4(col, a * 0.92 * fade);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------ deep space
export function nebulaMaterial(seed, tint) {
  return new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: seed % 1000 }, uTint: { value: new THREE.Vector3(...tint) }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uSeed, uFade; uniform vec3 uTint; varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float n = fbm(d * 2.2 + uSeed);
        float m = fbm(d * 5.0 - uSeed * 0.5);
        float band = exp(-pow(d.y * 2.4 + (n - 0.5) * 1.2, 2.0));
        vec3 col = uTint * pow(n, 3.0) * 0.55 + vec3(0.6, 0.3, 0.8) * pow(m, 4.0) * 0.35;
        col += vec3(0.85, 0.8, 1.0) * band * pow(m, 2.0) * 0.22;
        // Fine star dust.
        vec3 g = floor(d * 380.0); float s = hash31(g);
        col += vec3(1.0) * step(0.9975, s) * (0.4 + 0.6 * hash31(g + 3.0));
        gl_FragColor = vec4(col * 0.5 * uFade, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

export function sunMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Vector3(...color) } },
    vertexShader: /* glsl */ `
      ${LOGDEPTH_VERT_PARS}
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor; varying vec2 vUv;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        float core = smoothstep(0.16, 0.13, r);
        float glow = pow(max(0.0, 1.0 - r), 3.0);
        float rays = pow(max(0.0, 1.0 - r), 2.0) * (0.5 + 0.5 * cos(atan(p.y, p.x) * 8.0)) * 0.25;
        vec3 col = uColor * (core * 14.0 + glow * 1.6 + rays * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Terrain: PBR with vertex colours plus procedural close-up detail.
export function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLocalPos;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float d1 = vnoise(vLocalPos * 0.9), d2 = vnoise(vLocalPos * 5.0), d3 = vnoise(vLocalPos * 0.12);
          float near = 1.0 - smoothstep(30.0, 220.0, length(vViewPosition));
          diffuseColor.rgb *= 0.86 + 0.28 * d3 + near * (0.22 * (d1 - 0.5) + 0.18 * (d2 - 0.5));
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Procedural bump: fine grain up close, broad lumps further out.
          float nearB = 1.0 - smoothstep(20.0, 160.0, length(vViewPosition));
          vec3 q = vLocalPos * 2.2; float e = 0.35;
          float b0 = vnoise(q) + 0.5 * vnoise(q * 3.7);
          vec3 gr = vec3(vnoise(q + vec3(e,0,0)) + 0.5 * vnoise((q + vec3(e,0,0)) * 3.7), vnoise(q + vec3(0,e,0)) + 0.5 * vnoise((q + vec3(0,e,0)) * 3.7), vnoise(q + vec3(0,0,e)) + 0.5 * vnoise((q + vec3(0,0,e)) * 3.7)) - b0;
          normal = normalize(normal - (viewMatrix * vec4(gr, 0.0)).xyz * (0.55 * nearB + 0.1));
        }`,
      );
  };
  return m;
}
