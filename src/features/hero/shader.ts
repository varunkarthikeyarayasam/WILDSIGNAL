/*
 * WILDSIGNAL · Living Digital Earth
 * A single full-screen-triangle fragment shader that ray-shades a sphere with domain-warped terrain,
 * relief lighting, lichen filaments and a few coral glints. No textures, no geometry, no dependencies.
 *
 * Everything here is DECORATIVE. The coral glints are not observations and are not tied to any data.
 * Palette: black plum #211622, acid lichen #B7C65B, molten coral #E76B4A, dusty lilac #D8B6D5, warm bone #F7E8CE.
 */

export const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;   // canvas size in device pixels
uniform float uTime; // seconds
uniform vec2 uRot;   // yaw, pitch (radians)

const vec3 LICHEN = vec3(0.718, 0.776, 0.357);
const vec3 CORAL  = vec3(0.906, 0.420, 0.290);
const vec3 LILAC  = vec3(0.847, 0.714, 0.835);
const vec3 BONE   = vec3(0.969, 0.910, 0.808);

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < __OCT__; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

vec3 rotY(vec3 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

vec3 rotX(vec3 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
}

void main() {
  // The canvas is a square; the planet has radius 1.0 and the canvas spans +/-1.45 (room for the atmosphere).
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y)) * 1.45;
  float rr = length(p);
  vec3 Lv = normalize(vec3(-0.62, 0.48, 0.62));
  vec4 outc = vec4(0.0);

  // ── atmosphere: dusty-lilac haze biased to the lit limb, with a thin lichen rim light ──
  if (rr > 0.985) {
    float d = max(rr - 1.0, 0.0);
    vec2 dir = p / max(rr, 0.0001);
    float side = clamp(dot(dir, normalize(Lv.xy)) * 0.5 + 0.5, 0.0, 1.0);
    float halo = exp(-d * 9.0) * 0.62 + exp(-d * 2.6) * 0.2;
    halo *= 0.22 + 0.78 * side * side;
    float ring = exp(-pow((rr - 1.032) * 40.0, 2.0)) * 0.34 * side;
    vec3 hc = mix(LILAC, LICHEN, 0.2 * side * side * side);
    float a = clamp(halo + ring, 0.0, 1.0) * (1.0 - smoothstep(1.18, 1.45, rr));
    outc = vec4(hc * a, a * 0.55);
  }

  // ── planet ──
  if (rr < 1.0) {
    float z = sqrt(max(1.0 - rr * rr, 0.0));
    vec3 n = vec3(p, z);
    vec3 q = rotY(rotX(n, uRot.y), uRot.x);
    vec3 Lo = rotY(rotX(Lv, uRot.y), uRot.x);
    float t = uTime * 0.045;

    // fluid, domain-warped terrain
    vec3 w = vec3(
      fbm3(q * 1.5 + vec3(0.0, t, 0.0)),
      fbm3(q * 1.5 + vec3(5.2, 1.3, t)),
      fbm3(q * 1.5 + vec3(2.1, t, 8.3)));
    vec3 wq = q * 2.3 + (w - 0.44) * 1.9;
    float h = fbm(wq);
    float hn = clamp((h - 0.30) / 0.36, 0.0, 1.0);

    // relief: gradient of a cheaper height field, projected onto the sphere's tangent plane
    float e = 0.012;
    float h0 = fbm3(wq);
    vec3 g = vec3(fbm3(wq + vec3(e, 0.0, 0.0)) - h0, fbm3(wq + vec3(0.0, e, 0.0)) - h0, fbm3(wq + vec3(0.0, 0.0, e)) - h0) / e;
    vec3 gt = g - q * dot(g, q);
    vec3 np = normalize(q - gt * 0.06);
    float lit = clamp((dot(np, Lo) + 0.12) / 1.12, 0.0, 1.0);

    // velvet albedo: black plum valleys rising to lilac ridges
    vec3 alb = mix(vec3(0.115, 0.070, 0.120), vec3(0.50, 0.36, 0.50), hn);
    alb = mix(alb, LILAC * 0.8, smoothstep(0.62, 0.95, hn) * 0.5);
    vec3 col = alb * (0.10 + 1.15 * pow(lit, 1.15)) * mix(vec3(1.0, 0.88, 0.98), BONE, lit * 0.5);

    // fine contour linework
    float cl = abs(fract(h * 13.0) - 0.5);
    col = mix(col, LILAC, smoothstep(0.455, 0.5, cl) * 0.2 * (0.25 + lit));

    // lichen filaments: thin, slowly flowing veins that stay faintly visible on the night side
    float rid = 1.0 - clamp(abs(fbm3(q * 3.4 + (w - 0.44) * 1.3 + vec3(0.0, t * 1.6, 0.0)) - 0.44) * 5.0, 0.0, 1.0);
    float vein = pow(rid, 10.0);
    float flow = 0.7 + 0.3 * sin(uTime * 0.7 + h * 14.0);
    col += LICHEN * vein * flow * (0.22 + 0.78 * lit) * 0.85;

    // a handful of decorative coral glints (not data)
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec3 s = normalize(vec3(
        sin(fi * 2.399 + 0.6) * cos(fi * 1.13 + 0.7),
        cos(fi * 1.91) * 0.85,
        cos(fi * 2.399 + 0.6) * sin(fi * 1.31 + 0.2) + 0.05));
      float d = distance(q, s);
      float pulse = 0.62 + 0.38 * sin(uTime * 1.3 + fi * 1.9);
      float core = 1.0 - smoothstep(0.0, 0.05, d); // increasing edges only: smoothstep is undefined when edge0 >= edge1
      float glow = (1.0 - smoothstep(0.0, 0.24, d)) * 0.32;
      col += CORAL * (core * 1.5 + glow) * pulse + BONE * core * 0.22 * pulse;
    }

    // limb: lilac fresnel and a trace of lichen on the lit edge
    float fres = pow(1.0 - z, 2.6);
    float limbLit = clamp(dot(normalize(n.xy + vec2(0.0001)), normalize(Lv.xy)) * 0.5 + 0.5, 0.0, 1.0);
    col += LILAC * fres * (0.16 + 0.6 * limbLit);
    col = mix(col, LICHEN * 0.9, fres * fres * 0.12 * lit);

    col = col / (1.0 + 0.18 * col);
    col += (hash(vec3(gl_FragCoord.xy, uTime)) - 0.5) / 255.0; // dither against banding

    float edge = 1.0 - smoothstep(0.99, 1.0, rr);
    outc = mix(outc, vec4(col, 1.0), edge);
  }

  gl_FragColor = outc;
}
`

export function fragmentShader(octaves: number) {
  return FRAGMENT.replace(/__OCT__/g, String(octaves))
}
