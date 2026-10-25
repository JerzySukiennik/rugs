// Rug Rush fluids: GLSL ES 3.0 sources for the virtual-pipe shallow-water floor simulation passes.
export const PASS_VERT = `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const SPLAT_VERT = `
precision highp float;
in vec3 position;
in vec4 aSplat;
in vec4 aValue;
out vec2 vLocal;
out vec4 vValue;
void main() {
  vLocal = position.xy;
  vValue = aValue;
  vec2 p = aSplat.xy + position.xy * aSplat.zw;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SPLAT_FRAG = `
precision highp float;
in vec2 vLocal;
in vec4 vValue;
out vec4 o;
void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 >= 1.0) discard;
  float w = (1.0 - r2) * (1.0 - r2);
  o = vValue * w;
}
`;

export const FLUX_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tState;
uniform sampler2D tFlux;
uniform sampler2D tTerrain;
uniform sampler2D tWet;
uniform float uCell;
uniform float uDt;
uniform float uG;
uniform float uFilm;
uniform float uBladeFilm;
uniform float uWetTh;
uniform float uPinDry;
uniform float uPinWet;
uniform float uFricBase;
uniform float uFricVisc;
uniform int uBlades;
uniform vec4 uBladeSeg[4];
uniform vec4 uBladeVel[4];
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(tState, 0);
  vec4 s = texelFetch(tState, p, 0);
  vec4 ter = texelFetch(tTerrain, p, 0);
  float h = s.r;
  if (ter.g > 0.5 || h <= 1e-7) { o = vec4(0.0); return; }
  vec4 fl = texelFetch(tFlux, p, 0);
  float f[4];
  f[0] = fl.x; f[1] = fl.y; f[2] = fl.z; f[3] = fl.w;
  ivec2 off[4];
  off[0] = ivec2(-1, 0); off[1] = ivec2(1, 0); off[2] = ivec2(0, -1); off[3] = ivec2(0, 1);
  float H = ter.r + h;
  float fric = uFricBase + uFricVisc / max(h * h, 1e-9);
  for (int k = 0; k < 4; k++) {
    ivec2 q = p + off[k];
    if (q.x < 0 || q.y < 0 || q.x >= n.x || q.y >= n.y) { f[k] = 0.0; continue; }
    float hq = texelFetch(tState, q, 0).r;
    float dH = H - (texelFetch(tTerrain, q, 0).r + hq);
    if (hq < uWetTh) dH -= mix(uPinDry, uPinWet, texelFetch(tWet, q, 0).r) * texelFetch(tTerrain, q, 0).b;
    f[k] = max((f[k] + uDt * uG * h * dH) / (1.0 + uDt * fric), 0.0);
  }
  float film = uFilm;
  vec2 pc = (vec2(p) + 0.5) * uCell;
  for (int i = 0; i < 4; i++) {
    if (i >= uBlades) break;
    vec2 a = uBladeSeg[i].xy;
    vec2 b = uBladeSeg[i].zw;
    vec2 e = b - a;
    float L = max(length(e), 1e-4);
    vec2 ed = e / L;
    float t = dot(pc - a, ed);
    if (t < -uCell || t > L + uCell) continue;
    float tc = clamp(t / L, 0.0, 1.0);
    vec2 v = mix(uBladeVel[i].xy, uBladeVel[i].zw, tc);
    vec2 nb = vec2(-ed.y, ed.x);
    float vn = dot(v, nb);
    vec2 nr = vn >= 0.0 ? nb : -nb;
    float sp = abs(vn);
    float d = dot(pc - a, nr);
    float back = 1.5 * uCell + sp * uDt;
    if (d < -back || d > 1.5 * uCell) continue;
    bool moving = sp > 0.03;
    bool inside = t >= -0.6 * uCell && t <= L + 0.6 * uCell;
    if (d < 0.0 && moving && inside) {
      film = uBladeFilm;
      float w[4];
      float wsum = 0.0;
      for (int k = 0; k < 4; k++) { w[k] = max(dot(vec2(off[k]), nr), 0.0); wsum += w[k]; }
      float push = max(h - uBladeFilm, 0.0) * uCell * uCell / uDt;
      for (int k = 0; k < 4; k++) f[k] = wsum > 0.0 ? push * w[k] / wsum : 0.0;
    } else {
      for (int k = 0; k < 4; k++) {
        vec2 ov = vec2(off[k]) * uCell;
        float dq = d + dot(ov, nr);
        float tq = t + dot(ov, ed);
        bool ext = tq >= -0.7 * uCell && tq <= L + 0.7 * uCell;
        bool crossing = (d >= 0.0) != (dq >= 0.0);
        if (crossing && ext) { f[k] = 0.0; continue; }
        if (moving && d >= 0.0 && d < 1.5 * uCell && inside) {
          float w = max(dot(vec2(off[k]), nr), 0.0);
          float side = abs(dot(vec2(off[k]), ed));
          f[k] *= mix(1.0, 0.5, side);
          if (d < uCell) f[k] = max(f[k], h * sp * uCell * w);
        }
      }
    }
  }
  float tot = (f[0] + f[1] + f[2] + f[3]) * uDt;
  float avail = max(h - film, 0.0) * uCell * uCell;
  float K = tot > 1e-14 ? min(1.0, avail / tot) : 1.0;
  o = vec4(f[0], f[1], f[2], f[3]) * K;
}
`;

export const DEPTH_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tState;
uniform sampler2D tFlux;
uniform sampler2D tTerrain;
uniform sampler2D tSrc;
uniform sampler2D tPowder;
uniform sampler2D tRipSrc;
uniform float uHasSrc;
uniform float uHasRip;
uniform float uCell;
uniform float uDt;
uniform float uDrain;
uniform float uEvap;
uniform float uFoamDecay;
uniform float uFoamDecayDry;
uniform float uFoamGen;
uniform float uDissolve;
uniform float uSoapPerKg;
uniform int uRemoves;
uniform vec4 uRemove[8];
out vec4 o;
vec4 inflow(ivec2 q, float fq) {
  vec4 sq = texelFetch(tState, q, 0);
  float iv = sq.r > 1e-9 ? 1.0 / sq.r : 0.0;
  return fq * vec4(1.0, sq.g * iv, sq.b * iv, sq.a * iv);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(tState, 0);
  vec4 s = texelFetch(tState, p, 0);
  vec4 f = texelFetch(tFlux, p, 0);
  float h = s.r;
  float outF = f.x + f.y + f.z + f.w;
  vec4 inS = vec4(0.0);
  if (p.x > 0) { ivec2 q = p + ivec2(-1, 0); inS += inflow(q, texelFetch(tFlux, q, 0).y); }
  if (p.x < n.x - 1) { ivec2 q = p + ivec2(1, 0); inS += inflow(q, texelFetch(tFlux, q, 0).x); }
  if (p.y > 0) { ivec2 q = p + ivec2(0, -1); inS += inflow(q, texelFetch(tFlux, q, 0).w); }
  if (p.y < n.y - 1) { ivec2 q = p + ivec2(0, 1); inS += inflow(q, texelFetch(tFlux, q, 0).z); }
  float iv = h > 1e-9 ? 1.0 / h : 0.0;
  float k = uDt / (uCell * uCell);
  float nh = h + k * (inS.x - outF);
  vec3 tr = s.gba + k * (inS.yzw - outF * s.gba * iv);
  vec4 src = uHasSrc > 0.5 ? texelFetch(tSrc, p, 0) : vec4(0.0);
  float addW = max(src.r, 0.0) * 0.001;
  nh += addW;
  tr.x += max(src.g, 0.0) * 0.001;
  tr.y += max(src.b, 0.0);
  tr.z += max(src.a, 0.0) * 0.001;
  float soapC = nh > 1e-7 ? clamp(tr.z / nh, 0.0, 1.0) : 0.0;
  vec2 uvc = (vec2(p) + 0.5) / vec2(n);
  float ag = uHasRip > 0.5 ? abs(texture(tRipSrc, uvc).r) : 0.0;
  tr.y += uFoamGen * soapC * ag * smoothstep(0.0002, 0.001, nh);
  vec4 pw = texelFetch(tPowder, p, 0);
  if (nh > 0.0003) tr.z += pw.a * (1.0 - exp(-uDissolve * uDt)) * uSoapPerKg * 0.001;
  vec2 uv = uvc;
  for (int i = 0; i < 8; i++) {
    if (i >= uRemoves) break;
    vec4 r = uRemove[i];
    float d = length(uv - r.xy) / r.z;
    if (d < 1.0) {
      float w = 1.0 - d * d;
      float m = 1.0 - r.w * w * w;
      nh *= m;
      tr *= m;
    }
  }
  if (texelFetch(tTerrain, p, 0).g > 0.5) {
    float m = exp(-uDrain * uDt);
    nh *= m;
    tr *= m;
  }
  nh = max(nh - uEvap * uDt, 0.0);
  tr.y *= exp(-uDt * (nh > 0.0002 ? uFoamDecay : uFoamDecayDry));
  tr.x = clamp(tr.x, 0.0, nh);
  tr.y = max(tr.y, 0.0);
  tr.z = clamp(tr.z, 0.0, nh);
  o = vec4(nh, tr.x, tr.y, tr.z);
}
`;

export const WET_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tState;
uniform sampler2D tFlux;
uniform sampler2D tWet;
uniform sampler2D tTerrain;
uniform float uCell;
uniform float uDt;
uniform float uDryRate;
uniform float uWetTh;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(tState, 0);
  float h = texelFetch(tState, p, 0).r;
  float wet = texelFetch(tWet, p, 0).r;
  wet = h > uWetTh ? 1.0 : max(wet - uDt * uDryRate, 0.0);
  vec4 f = texelFetch(tFlux, p, 0);
  float fl = p.x > 0 ? texelFetch(tFlux, p + ivec2(-1, 0), 0).y : 0.0;
  float fr = p.x < n.x - 1 ? texelFetch(tFlux, p + ivec2(1, 0), 0).x : 0.0;
  float fd = p.y > 0 ? texelFetch(tFlux, p + ivec2(0, -1), 0).w : 0.0;
  float fu = p.y < n.y - 1 ? texelFetch(tFlux, p + ivec2(0, 1), 0).z : 0.0;
  float qx = 0.5 * (fl - f.x + f.y - fr);
  float qz = 0.5 * (fd - f.z + f.w - fu);
  vec2 vel = vec2(qx, qz) / (uCell * max(h, 0.0006));
  float dr = 0.0;
  if (texelFetch(tTerrain, p, 0).g > 0.5) {
    for (int dj = -4; dj <= 4; dj++) {
      for (int di = -1; di <= 1; di++) {
        ivec2 q = p + ivec2(di, dj);
        if (q.x < 1 || q.y < 1 || q.x >= n.x - 1 || q.y >= n.y - 1) continue;
        if (texelFetch(tTerrain, q, 0).g < 0.5) continue;
        float w = di == 0 ? 0.5 : 0.25;
        if (texelFetch(tTerrain, q + ivec2(0, -1), 0).g < 0.5) dr += w * texelFetch(tFlux, q + ivec2(0, -1), 0).w;
        if (texelFetch(tTerrain, q + ivec2(0, 1), 0).g < 0.5) dr += w * texelFetch(tFlux, q + ivec2(0, 1), 0).z;
        if (texelFetch(tTerrain, q + ivec2(-1, 0), 0).g < 0.5) dr += w * texelFetch(tFlux, q + ivec2(-1, 0), 0).y;
        if (texelFetch(tTerrain, q + ivec2(1, 0), 0).g < 0.5) dr += w * texelFetch(tFlux, q + ivec2(1, 0), 0).x;
      }
    }
    dr /= uCell * 0.004;
  } else {
    if (p.x > 0 && texelFetch(tTerrain, p + ivec2(-1, 0), 0).g > 0.5) dr += f.x;
    if (p.x < n.x - 1 && texelFetch(tTerrain, p + ivec2(1, 0), 0).g > 0.5) dr += f.y;
    if (p.y > 0 && texelFetch(tTerrain, p + ivec2(0, -1), 0).g > 0.5) dr += f.z;
    if (p.y < n.y - 1 && texelFetch(tTerrain, p + ivec2(0, 1), 0).g > 0.5) dr += f.w;
    dr /= uCell * 0.004;
  }
  o = vec4(wet, vel, dr);
}
`;

export const POWDER_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tPowder;
uniform sampler2D tPsrc;
uniform sampler2D tState;
uniform float uHasSrc;
uniform float uDt;
uniform float uLife;
uniform float uDissolve;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 pw = texelFetch(tPowder, p, 0) + (uHasSrc > 0.5 ? max(texelFetch(tPsrc, p, 0), vec4(0.0)) : vec4(0.0));
  pw *= exp(-uDt / uLife);
  if (texelFetch(tState, p, 0).r > 0.0003) pw *= exp(-uDissolve * uDt);
  o = pw;
}
`;

export const RIPPLE_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tRip;
uniform sampler2D tRipSrc;
uniform sampler2D tA;
uniform float uHasSrc;
uniform float uC2;
uniform float uDamp;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(tRip, 0);
  vec4 r = texelFetch(tRip, p, 0);
  float l = texelFetch(tRip, ivec2(max(p.x - 1, 0), p.y), 0).r;
  float rr = texelFetch(tRip, ivec2(min(p.x + 1, n.x - 1), p.y), 0).r;
  float d = texelFetch(tRip, ivec2(p.x, max(p.y - 1, 0)), 0).r;
  float u = texelFetch(tRip, ivec2(p.x, min(p.y + 1, n.y - 1)), 0).r;
  float lap = l + rr + d + u - 4.0 * r.r;
  float nh = r.r + (r.r - r.g) * uDamp + uC2 * lap + (uHasSrc > 0.5 ? texelFetch(tRipSrc, p, 0).r : 0.0);
  vec2 uv = (vec2(p) + 0.5) / vec2(n);
  float mask = smoothstep(0.12, 0.45, texture(tA, uv).r);
  o = vec4(clamp(nh * mask, -0.02, 0.02), r.r * mask, (rr - l) * 0.5, (u - d) * 0.5);
}
`;

export const PACK_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tState;
uniform sampler2D tWet;
uniform float uMode;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tState, p, 0);
  float iv = s.r > 1e-6 ? 1.0 / s.r : 0.0;
  if (uMode < 0.5) o = vec4(s.r * 1000.0, clamp(s.g * iv, 0.0, 1.0), s.b, clamp(s.a * iv, 0.0, 1.0));
  else o = vec4(s.r, texelFetch(tWet, p, 0).r, clamp(s.g * iv, 0.0, 1.0), s.b);
}
`;

export const MASK_FRAG = `
precision highp float;
precision highp sampler2D;
uniform sampler2D tState;
uniform sampler2D tWet;
uniform sampler2D tPowder;
uniform int uBlock;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 n = textureSize(tState, 0);
  ivec2 b0 = p * uBlock - 2;
  float any = 0.0;
  for (int j = 0; j < 16; j++) {
    if (j >= uBlock + 4) break;
    for (int i = 0; i < 16; i++) {
      if (i >= uBlock + 4) break;
      ivec2 q = clamp(b0 + ivec2(i, j), ivec2(0), n - 1);
      vec4 s = texelFetch(tState, q, 0);
      float w = texelFetch(tWet, q, 0).r;
      float pa = texelFetch(tPowder, q, 0).a;
      if (s.r > 0.00001 || s.b > 0.0005 || w > 0.003 || pa > 0.0002) any = 1.0;
    }
  }
  o = vec4(any, 0.0, 0.0, 1.0);
}
`;
