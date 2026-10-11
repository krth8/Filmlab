export const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
uniform float u_flip;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  if (u_flip > 0.5) v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** Colour grade: exposure + white balance in linear light, then tone, saturation, film look, LUT, HSL and curves. */
export const FS_GRADE = COMMON + `
uniform sampler2D u_src;
uniform sampler2D u_curve;
uniform sampler3D u_lut;
uniform vec3 u_wb;            // exposure * white balance multipliers (linear)
uniform float u_con, u_hi, u_sh, u_sat, u_vib;
uniform int u_fOn, u_fMono;
uniform float u_fk, u_fWarm, u_fCon, u_fSat, u_fSplit, u_fFade;
uniform vec3 u_fS, u_fH;
uniform int u_lutOn;
uniform float u_lutK, u_lutSize;
uniform int u_hslOn;
uniform vec3 u_hsl[8];
uniform float u_bandH[8];

vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 toGam(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 hsl2rgb(vec3 h){
  vec3 rgb = clamp(abs(mod(h.x*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return h.z + h.y * (rgb - 0.5) * (1.0 - abs(2.0*h.z - 1.0));
}

void main(){
  vec3 c = texture(u_src, v_uv).rgb;
  c = toGam(toLin(c) * u_wb);
  float l = luma(c);
  if (u_sh != 0.0) { float q = 1.0 - min(1.0, l); c *= 1.0 + u_sh * 1.3 * q*q*q; }
  if (u_hi != 0.0) {
    float lc = min(1.0, l), k = lc*lc;
    if (u_hi < 0.0) c *= 1.0 + u_hi * 0.55 * k; else c += u_hi * 0.45 * k * (1.0 - c);
  }
  c = (c - 0.45) * u_con + 0.45;
  l = luma(c);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = l + (c - l) * (u_sat * (1.0 + u_vib * (1.0 - clamp(mx - mn, 0.0, 1.0)) * 1.2));

  if (u_fOn == 1) {
    vec3 c0 = c;
    c.r *= 1.0 + u_fWarm * 0.16; c.b *= 1.0 - u_fWarm * 0.16;
    c = (c - 0.45) * (1.0 + u_fCon * 0.7) + 0.45;
    l = luma(c);
    if (u_fMono == 1) { l = dot(c, vec3(0.3, 0.59, 0.11)); c = vec3(l); }
    else c = l + (c - l) * (1.0 + u_fSat);
    if (u_fSplit > 0.0) {
      float lc = clamp(l, 0.0, 1.0), ws = (1.0-lc)*(1.0-lc), wh = lc*lc;
      c += u_fSplit * 0.32 * (ws * (u_fS - 0.5) + wh * (u_fH - 0.5));
    }
    float fa = u_fFade * 0.25; c = fa + c * (1.0 - fa);
    c = mix(c0, c, u_fk);
  }
  c = clamp(c, 0.0, 1.0);

  if (u_lutOn == 1) {
    vec3 coord = c * ((u_lutSize - 1.0) / u_lutSize) + 0.5 / u_lutSize;
    c = mix(c, texture(u_lut, coord).rgb, u_lutK);
  }

  if (u_hslOn == 1) {
    float M = max(c.r, max(c.g, c.b)), m = min(c.r, min(c.g, c.b)), d = M - m;
    if (d > 0.01) {
      float L = (M + m) * 0.5;
      float S = L > 0.5 ? d / (2.0 - M - m) : d / (M + m);
      float H = M == c.r ? (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0) : M == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
      H *= 60.0;
      vec3 acc = vec3(0.0);
      for (int k = 0; k < 8; k++) {
        float df = abs(H - u_bandH[k]); if (df > 180.0) df = 360.0 - df;
        acc += u_hsl[k] * max(0.0, 1.0 - df / 42.0);
      }
      if (acc != vec3(0.0)) {
        float nS = clamp(S * (1.0 + acc.y / 100.0), 0.0, 1.0);
        float nL = clamp(L + acc.z / 100.0 * 0.3 * S, 0.0, 1.0);
        c = hsl2rgb(vec3(mod(H + acc.x, 360.0) / 360.0, nS, nL));
      }
    }
  }

  vec3 t = c * (255.0/256.0) + 0.5/256.0;
  c = vec3(texture(u_curve, vec2(t.r, 0.5)).r, texture(u_curve, vec2(t.g, 0.5)).g, texture(u_curve, vec2(t.b, 0.5)).b);
  o = vec4(c, 1.0);
}`;

/** Soft-knee bright pass for bloom/halation, rendered at half resolution. */
export const FS_BRIGHT = COMMON + `
uniform sampler2D u_src;
uniform float u_thr;
void main(){
  vec3 c = texture(u_src, v_uv).rgb;
  float k = max(0.0, (luma(c) - u_thr) / (1.0 - u_thr));
  o = vec4(c * k * k, 1.0);
}`;

/** Dual-filter (Kawase) downsample. */
export const FS_DOWN = COMMON + `
uniform sampler2D u_src;
uniform vec2 u_texel;
void main(){
  vec2 h = u_texel * 0.5;
  vec3 s = texture(u_src, v_uv).rgb * 4.0;
  s += texture(u_src, v_uv - h).rgb + texture(u_src, v_uv + h).rgb;
  s += texture(u_src, v_uv + vec2(h.x, -h.y)).rgb + texture(u_src, v_uv - vec2(h.x, -h.y)).rgb;
  o = vec4(s / 8.0, 1.0);
}`;

/** Dual-filter upsample of the coarser level, added onto the current level. */
export const FS_UP = COMMON + `
uniform sampler2D u_src;   // coarser, already accumulated
uniform sampler2D u_cur;   // this level's downsample
uniform vec2 u_texel;      // texel of u_src
uniform float u_w;
void main(){
  vec2 h = u_texel * 0.5;
  vec3 s = texture(u_src, v_uv + vec2(-h.x*2.0, 0.0)).rgb;
  s += texture(u_src, v_uv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, h.y*2.0)).rgb;
  s += texture(u_src, v_uv + vec2(h.x, h.y)).rgb * 2.0;
  s += texture(u_src, v_uv + vec2(h.x*2.0, 0.0)).rgb;
  s += texture(u_src, v_uv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, -h.y*2.0)).rgb;
  s += texture(u_src, v_uv + vec2(-h.x, -h.y)).rgb * 2.0;
  o = vec4(texture(u_cur, v_uv).rgb + s / 12.0 * u_w, 1.0);
}`;

/** Separable gaussian, reading the source at a mip level so large radii stay cheap. */
export const FS_GAUSS = COMMON + `
uniform sampler2D u_src;
uniform vec2 u_dir;     // texel step in uv
uniform float u_lod;
void main(){
  // 13-tap gaussian using linear-filtering offsets
  float w[4] = float[](0.1964825501511404, 0.2969069646728344, 0.09447039785044732, 0.010381362401148057);
  float off[4] = float[](0.0, 1.411764705882353, 3.2941176470588234, 5.176470588235294);
  vec3 s = textureLod(u_src, v_uv, u_lod).rgb * w[0];
  for (int i = 1; i < 4; i++) {
    s += textureLod(u_src, v_uv + u_dir * off[i], u_lod).rgb * w[i];
    s += textureLod(u_src, v_uv - u_dir * off[i], u_lod).rgb * w[i];
  }
  o = vec4(s, 1.0);
}`;

/** Composite: blur mask, bloom (screen), halation, vignette and grain. */
export const FS_FINISH = COMMON + `
uniform sampler2D u_a, u_blur, u_bloom, u_hal;
uniform int u_blurOn, u_blurMode;
uniform float u_bloomK, u_halK, u_vig, u_vigIn, u_grain, u_grainSize, u_seed, u_aspect;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec3 c = texture(u_a, v_uv).rgb;
  if (u_blurOn == 1) {
    float m = 1.0;
    if (u_blurMode == 0) { float d = abs(v_uv.y - 0.47); m = smoothstep(0.12, 0.42, d); }
    else if (u_blurMode == 1) { vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0); m = smoothstep(0.18, 0.62, length(p) / max(u_aspect, 1.0) * 1.3); }
    c = mix(c, texture(u_blur, v_uv).rgb, m);
  }
  if (u_bloomK > 0.0) { vec3 b = clamp(texture(u_bloom, v_uv).rgb * u_bloomK, 0.0, 1.0); c = 1.0 - (1.0 - c) * (1.0 - b); }
  if (u_halK > 0.0) { float h = luma(texture(u_hal, v_uv).rgb); c += vec3(1.0, 0.27, 0.11) * h * u_halK; }
  if (u_vig != 0.0) {
    vec2 n = (v_uv - 0.5) * 2.0;
    float f = clamp((length(n) / 1.4142 - u_vigIn) / (1.05 - u_vigIn), 0.0, 1.0);
    f = f * f * (3.0 - 2.0 * f);
    if (u_vig > 0.0) c *= 1.0 - u_vig * f; else c += (1.0 - c) * (-u_vig) * f;
  }
  if (u_grain > 0.0) {
    vec2 cell = floor(gl_FragCoord.xy / u_grainSize) + u_seed;
    float n = (hash(cell) + hash(cell + 17.31) + hash(cell + 41.7) - 1.5) * 1.2;
    float lm = luma(c), w = 0.35 + (1.0 - abs(lm - 0.5) * 2.0) * 0.65;
    c += n * u_grain * w;
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Plain copy, used for "show original". */
export const FS_COPY = COMMON + `
uniform sampler2D u_src;
void main(){ o = vec4(texture(u_src, v_uv).rgb, 1.0); }`;
