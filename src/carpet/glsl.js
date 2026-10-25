// Rug Rush carpet GLSL library: hashes, noise, color space helpers and SDF motif primitives shared by rug shaders.
export const GLSL_COMMON = `
float rr_h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float rr_h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 rr_h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 rr_h32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float rr_vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rr_h21(i), rr_h21(i + vec2(1.0, 0.0)), u.x), mix(rr_h21(i + vec2(0.0, 1.0)), rr_h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rr_fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * rr_vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s / 0.96875;
}
float rr_fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * rr_vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s / 0.875;
}
vec3 rr_voronoi(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = rr_h22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), rr_h21(id));
}
vec3 rr_toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 rr_toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float rr_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rr_sat(vec3 c, float s) { float l = rr_luma(c); return max(vec3(0.0), mix(vec3(l), c, s)); }
vec3 rr_hue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec2 rr_rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
`;

export const GLSL_SDF = `
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdDiamond(vec2 p, vec2 r) { p = abs(p); return (p.x / r.x + p.y / r.y - 1.0) * min(r.x, r.y) * 0.7071; }
float sdLeaf(vec2 p, float len, float wid, float bend) {
  p.x += bend * (p.y * p.y / max(len, 1e-3) - len * 0.25);
  float t = clamp(p.y / len, -1.0, 1.0);
  float w = wid * (1.0 - t * t);
  return (abs(p.x) - w) * 0.8 + max(abs(p.y) - len, 0.0);
}
float sdRosette(vec2 p, float r, float n, float depth) {
  float a = atan(p.y, p.x);
  float rr = r * (1.0 - depth + depth * abs(cos(a * n * 0.5)));
  return (length(p) - rr) * 0.85;
}
float sdPalmette(vec2 p, float r) {
  float l = length(p);
  float a = atan(p.x, p.y);
  float lob = 0.78 + 0.22 * abs(cos(a * 4.5));
  float d1 = l - r * lob;
  float d2 = (abs(a) - 1.15) * max(l, 1e-3);
  return max(d1, d2);
}
float sdStar(vec2 p, float r, float n, float k) {
  float a = atan(p.y, p.x);
  float s = cos(a * n);
  return (length(p) - r * (1.0 - k + k * s)) * 0.8;
}
`;

export const GLSL_UVLAMP = `
uniform float uUvOn;
uniform vec3 uUvPos;
uniform vec3 uUvDir;
uniform float uUvCos;
float rr_uvCone(vec3 wp) {
  if (uUvOn < 0.5) return 0.0;
  vec3 d = wp - uUvPos;
  float dist = length(d);
  float c = dot(d / max(dist, 1e-4), uUvDir);
  float edge = smoothstep(uUvCos, mix(uUvCos, 1.0, 0.18), c);
  return edge / (1.0 + dist * dist * 0.06);
}
vec3 rr_uvApply(vec3 lit, vec3 albedo, float cone, float urine, float bright) {
  if (cone <= 0.0) return lit;
  float k = min(cone, 1.0);
  vec3 violet = vec3(0.07, 0.022, 0.2) * (0.35 + 0.9 * rr_luma(albedo)) * cone;
  vec3 glow = (vec3(0.45, 0.85, 0.06) * smoothstep(0.03, 0.95, urine) * 1.5 + vec3(0.42, 0.55, 1.0) * bright * 1.2) * cone;
  return mix(lit, lit * 0.12, k) + violet + glow;
}
`;
