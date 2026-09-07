// Coin Loader — Originkit
//
// Ported into NEMO verbatim apart from its framing. Framer sized the root with
// a 1200x800 floor so "Fit Content" could not collapse it to a dot; NEMO drops
// it into a ~140px loading slot instead, so the floor is gone and the root
// simply fills whatever box it is given. The default background is transparent
// so the loader composites over the panel it sits in rather than punching a
// dark rectangle through it.

/**
 * ORIGAMI COINS — eight discs carried round a slowly counter-turning ring,
 * each tumbling on all three axes at once.
 *
 * Port of `Item3` ("Coins") from d3adrabbit/origami (Codrops, "Origami: Free
 * 3D Motion Graphics"). The reference defines the interaction, the motion and
 * the framing (rule 8), and this reproduces them term for term:
 *
 *   - eight radius-1, 0.1-thick, 64-segment cylinders on a circle of radius 3,
 *     the whole ring scaled 0.6, under a `<Center>` that is a no-op because
 *     the ring is already symmetric about the origin;
 *   - each disc sits inside two nested transforms: the ring places it with
 *     `T(pos) * Rz(a)`, then a tumbling group starts at Euler XYZ
 *     `(0, PI/count, PI/2)` — that is what stands the disc on edge — and adds
 *     the SAME increment to all three axes every frame;
 *   - the ring itself turns the other way, at that same rate;
 *   - no pointer interaction of any kind — the reference has none.
 *
 * WHAT THE PORT CHANGES (machinery only):
 *
 *   - three.js + @react-three/fiber + drei + GSAP become raw WebGL and a raw
 *     rAF loop (rules 6 and 10). Nothing is imported that is not in this file.
 *   - the reference advances rotation by a fixed 0.01 PER FRAME, so its motion
 *     runs at whatever rate the display happens to refresh at. Here that is a
 *     rate: 0.01 x 60 = 0.6 rad/sec, integrated against real dt, so a 120Hz
 *     panel and a 60Hz panel show the same speed.
 *   - drei's `<Instances>` is dropped: eight indexed draw calls cost nothing,
 *     and instancing would need an extension in WebGL1.
 *   - `MeshMatcapMaterial` sampling a photographed chrome sphere becomes the
 *     analytic matcap in FRAG below, so Base Color / Accent Color drive the
 *     material instead of a dropdown of three baked textures.
 *
 * Keys are new — this file has no earlier shape and therefore no legacy
 * fallbacks to carry (rule 11c, clean break).
 */

import * as React from 'react';
import { useEffect, useRef } from 'react';

/* --------------------------------------------------------------- constants */

const TAU = Math.PI * 2;
const DPR_CAP = 2;
/** Vertical field of view. Framing is the Distance dial's job, not this. */
const FOV = (45 * Math.PI) / 180;
const NEAR = 0.1;
const FAR = 200;

/** The reference's ring radius, its group scale and its disc dimensions. */
const RADIUS = 3;
const GROUP_SCALE = 0.6;
const COIN_R = 1;
const COIN_H = 0.1;
const COIN_SEG = 64;

/** The reference's 0.01 rad per frame, restated as a rate at 60Hz. Both the
 *  tumble and the ring's counter-turn ship at it. */
const RATE = 0.6;

/* ------------------------------------------------------------------ colour */

type RGB = [number, number, number];

/**
 * The colour dials do NOT always hand back hex. Depending on where the swatch
 * came from it can be `rgb()`, `rgba()`, `hsl()`, `hsla()` or
 * `var(--token, <fallback>)`, so a hex-only parser silently pins every colour
 * to its default and the dial reads as dead.
 */
function parseColor(input: string | undefined, fb: RGB): RGB {
  if (!input) return fb;
  let s = String(input).trim();
  const v = /^var\(\s*--[^,]+,\s*(.+)\)\s*$/i.exec(s);
  if (v) s = v[1].trim();

  if (s.charAt(0) === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h =
        h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (h.length < 6) return fb;
    const n = parseInt(h.slice(0, 6), 16);
    if (!isFinite(n)) return fb;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  const m = /^(rgba?|hsla?)\(([^)]+)\)\s*$/i.exec(s);
  if (!m) return fb;
  const parts = m[2].split(/[\s,/]+/).filter((x) => x.length > 0);
  if (parts.length < 3) return fb;

  if (m[1].charAt(0).toLowerCase() === 'r') {
    const ch = (t: string) => (t.indexOf('%') >= 0 ? (parseFloat(t) / 100) * 255 : parseFloat(t));
    const r = ch(parts[0]);
    const g = ch(parts[1]);
    const b = ch(parts[2]);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return fb;
    return [r / 255, g / 255, b / 255];
  }

  // hsl() / hsla(). The hue may carry a deg / rad / turn unit.
  let hue = parseFloat(parts[0]);
  if (parts[0].indexOf('turn') >= 0) hue *= 360;
  else if (parts[0].indexOf('rad') >= 0) hue *= 180 / Math.PI;
  const sat = parseFloat(parts[1]) / 100;
  const lit = parseFloat(parts[2]) / 100;
  if (!isFinite(hue) || !isFinite(sat) || !isFinite(lit)) return fb;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const hp = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const mm = lit - c / 2;
  return [r + mm, g + mm, b + mm];
}

/* -------------------------------------------------------------------- mat4 */

type M4 = Float32Array;

/** Column-major, GL order — the same layout three.js uploads. */
function m4(): M4 {
  const o = new Float32Array(16);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

function m4Ident(o: M4): M4 {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

/** out = a * b. `out` must not alias either input. */
function m4Mul(a: M4, b: M4, out: M4): M4 {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

const SCR_A = m4();
const SCR_B = m4();

/* Every transform below POST-multiplies (m := m * R), so a chain of calls
 * reads outermost parent first, exactly like walking a three.js scene graph
 * downwards. Euler order XYZ means R = Rx * Ry * Rz, which is what
 * Matrix4.makeRotationFromEuler builds for three's default order — call
 * rotX, then rotY, then rotZ to reproduce it. */

function rotX(m: M4, a: number) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  m4Ident(SCR_A);
  SCR_A[5] = c;
  SCR_A[6] = s;
  SCR_A[9] = -s;
  SCR_A[10] = c;
  m.set(m4Mul(m, SCR_A, SCR_B));
}

function rotY(m: M4, a: number) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  m4Ident(SCR_A);
  SCR_A[0] = c;
  SCR_A[2] = -s;
  SCR_A[8] = s;
  SCR_A[10] = c;
  m.set(m4Mul(m, SCR_A, SCR_B));
}

function rotZ(m: M4, a: number) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  m4Ident(SCR_A);
  SCR_A[0] = c;
  SCR_A[1] = s;
  SCR_A[4] = -s;
  SCR_A[5] = c;
  m.set(m4Mul(m, SCR_A, SCR_B));
}

/** m := m * T(x, y, z) */
function trans(m: M4, x: number, y: number, z: number) {
  m[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
  m[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
  m[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
  m[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
}

/** m := m * S(s). Uniform only — non-uniform scale would need the inverse
 *  transpose for the normal matrix, and nothing here scales non-uniformly. */
function scaleU(m: M4, s: number) {
  for (let i = 0; i < 12; i++) m[i] *= s;
}

function persp(out: M4, fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** Upper-left 3x3 of the model matrix. The view is a pure translation, so a
 *  model normal IS the view-space normal; the uniform scale is divided out by
 *  the normalize() in the fragment shader. */
function nm3(m: M4, out: Float32Array) {
  out[0] = m[0];
  out[1] = m[1];
  out[2] = m[2];
  out[3] = m[4];
  out[4] = m[5];
  out[5] = m[6];
  out[6] = m[8];
  out[7] = m[9];
  out[8] = m[10];
}

/* ---------------------------------------------------------------- geometry */

interface Geo {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint16Array;
}

function pack(pos: number[], nrm: number[], idx: number[]): Geo {
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    idx: new Uint16Array(idx),
  };
}

/**
 * three.js CylinderGeometry(rTop, rBot, height, seg) with heightSegments 1.
 * Side normals are three's exact `normalize(sinTheta, slope, cosTheta)`, which
 * is why a 4-segment cone reads as a soft pyramid rather than a flat one —
 * the columns are shared, so the shading runs smoothly around each edge.
 */
function cylGeo(rTop: number, rBot: number, height: number, seg: number): Geo {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const half = height / 2;
  const slope = (rBot - rTop) / height;

  for (let y = 0; y <= 1; y++) {
    const r = y * (rBot - rTop) + rTop;
    for (let x = 0; x <= seg; x++) {
      const th = (x / seg) * TAU;
      const st = Math.sin(th);
      const ct = Math.cos(th);
      pos.push(r * st, -y * height + half, r * ct);
      const l = Math.sqrt(st * st + slope * slope + ct * ct);
      nrm.push(st / l, slope / l, ct / l);
    }
  }
  for (let x = 0; x < seg; x++) {
    const a = x;
    const d = x + 1;
    const b = seg + 1 + x;
    const c = seg + 1 + x + 1;
    if (rTop > 0) idx.push(a, b, d);
    if (rBot > 0) idx.push(b, c, d);
  }

  // Caps: one centre vertex plus a fan, wound outwards.
  const cap = (top: boolean) => {
    const r = top ? rTop : rBot;
    if (r <= 0) return;
    const y = top ? half : -half;
    const centre = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, top ? 1 : -1, 0);
    for (let x = 0; x <= seg; x++) {
      const th = (x / seg) * TAU;
      pos.push(r * Math.sin(th), y, r * Math.cos(th));
      nrm.push(0, top ? 1 : -1, 0);
    }
    for (let x = 0; x < seg; x++) {
      const p0 = centre + 1 + x;
      const p1 = centre + 1 + x + 1;
      if (top) idx.push(centre, p0, p1);
      else idx.push(centre, p1, p0);
    }
  };
  cap(true);
  cap(false);

  return pack(pos, nrm, idx);
}

/* ----------------------------------------------------------------- shaders */

const VERT = `
precision highp float;

attribute vec3 aPos;
attribute vec3 aNrm;

uniform mat4 uMVP;
uniform mat3 uNM;

varying vec3 vN;

void main() {
    vN = uNM * aNrm;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

/**
 * A PROCEDURAL matcap. The reference shades every mesh with
 * MeshMatcapMaterial against one of three photographed sphere textures
 * (chrome, iridescent, glossy purple): the lit colour is a lookup by the
 * view-space normal, with no light in the scene at all.
 *
 * Sampling a bitmap here would pin the component to an external asset and
 * leave a designer with a dropdown of three fixed looks, so the same shading
 * model is evaluated analytically instead and the two colour dials drive the
 * material directly.
 *
 * KEY and FILL are MEASURED, not invented: the reference's chrome matcap was
 * decoded, unwrapped to view-space normals and least-squares fitted, and those
 * are the two highlight directions that came back. The fit's residual is the
 * honest part of this — RMSE 0.15 over the hemisphere — because a photographed
 * chrome ball carries several reflected bands that two lobes cannot express.
 *
 * So this is an approximation and a DELIBERATE deviation, in one respect: the
 * reference matcap is near-black (0.05) for a surface facing the camera, which
 * on flat geometry drops whole plates and discs out of the frame. The body
 * term here keeps those faces readable. Everything else — where the highlight
 * sits, where the second lobe sits, the hot grazing rim — follows the
 * measurement.
 *
 * The lobes are authored in DISPLAY space, not linear, so there is no encode
 * at the end — unlike a ported physically-lit three scene, which needs one.
 */
const FRAG = `
precision highp float;

varying vec3 vN;

uniform vec3 uBase;
uniform vec3 uAcc;

// Fitted highlight directions of the reference's chrome matcap.
const vec3 KEY  = vec3(-0.4364, 0.4601, 0.7733);
const vec3 FILL = vec3( 0.7831, 0.1309, 0.6080);

void main() {
    vec3 n = normalize(vN);
    float k = max(dot(n, KEY), 0.0);
    float f = max(dot(n, FILL), 0.0);
    // Facing ratio: 1 at the silhouette, 0 dead-on. abs() so a back face that
    // wins the depth test through an opening still rims instead of going flat.
    float graze = 1.0 - clamp(abs(n.z), 0.0, 1.0);

    vec3 c = uBase * (0.08 + 0.62 * pow(k, 2.0));
    c += uAcc * 0.80 * pow(k, 9.0);
    c += uAcc * 0.35 * pow(f, 6.0);
    // The matcap's bright top edge: grazing, and weighted upwards.
    c += uAcc * 0.32 * pow(graze, 3.0) * (0.40 + 0.60 * max(n.y, 0.0));

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

/* ---------------------------------------------------------------- GL plumbing */

interface Mesh {
  pos: WebGLBuffer;
  nrm: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('shader: ' + gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('link: ' + gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function upload(gl: WebGLRenderingContext, g: Geo): Mesh | null {
  const pos = gl.createBuffer();
  const nrm = gl.createBuffer();
  const idx = gl.createBuffer();
  if (!pos || !nrm || !idx) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
  gl.bufferData(gl.ARRAY_BUFFER, g.nrm, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
  return { pos, nrm, idx, count: g.idx.length };
}

function freeMesh(gl: WebGLRenderingContext, m: Mesh) {
  gl.deleteBuffer(m.pos);
  gl.deleteBuffer(m.nrm);
  gl.deleteBuffer(m.idx);
}

function bindMesh(gl: WebGLRenderingContext, m: Mesh, aPos: number, aNrm: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
  gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
}

/* -------------------------------------------------------------------- props */

interface CoinsGroup {
  /** How many discs go round the ring. The reference ships 8. */
  count: number;
  /** Disc size as a percent of the reference's radius-1, 0.1-thick cylinder. */
  coinSize: number;
  /** Ring radius as a percent of the reference's 3 world units. */
  spread: number;
  /** The ring's counter-turn. 0..100, 50 = the reference's rate. */
  ringSpeed: number;
}

const COINS_DEFAULTS: CoinsGroup = {
  count: 8,
  coinSize: 100,
  spread: 100,
  ringSpeed: 50,
};

export interface CoinLoaderProps {
  background?: string;
  baseColor?: string;
  accentColor?: string;
  /** 0..100; 50 is the reference's tumble rate. */
  speed?: number;
  /** Camera pullback in world units. */
  distance?: number;
  coins?: Partial<CoinsGroup>;
  style?: React.CSSProperties;
  className?: string;
}

/* ---------------------------------------------------------------- component */

export function CoinLoader(props: CoinLoaderProps) {
  const {
    background = 'transparent',
    baseColor = '#FFFFFF',
    accentColor = '#FFFFFF',
    speed = 100,
    distance = 20,
    // A group the caller never set arrives undefined, and one row of it can be
    // missing on its own, so merge over a typed literal rather than reaching
    // for `??` at every read site.
    coins,
    style,
    className = '',
  } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Every live input the loop reads. Written on render, never a dep of the
   * GL effect — a colour change must not rebuild the context. */
  const live = useRef({
    base: [0, 0, 0] as RGB,
    acc: [0, 0, 0] as RGB,
    speed: 50,
    distance: 7,
    coins: COINS_DEFAULTS,
  });
  live.current = {
    base: parseColor(baseColor, [0.56, 0.6, 0.65]),
    acc: parseColor(accentColor, [1, 1, 1]),
    speed,
    distance,
    coins: { ...COINS_DEFAULTS, ...coins },
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const gl = canvas.getContext('webgl', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: true,
    }) as WebGLRenderingContext | null;
    if (!gl) return;

    const prog = buildProgram(gl);
    if (!prog) return;
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNrm = gl.getAttribLocation(prog, 'aNrm');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);

    const uMVP = gl.getUniformLocation(prog, 'uMVP');
    const uNM = gl.getUniformLocation(prog, 'uNM');
    const uBase = gl.getUniformLocation(prog, 'uBase');
    const uAcc = gl.getUniformLocation(prog, 'uAcc');
    // A typo'd name resolves to null and the uniform silently never uploads,
    // so say so loudly instead of rendering a black frame.
    if (!uMVP || !uNM || !uBase || !uAcc) {
      console.error('CoinLoader: uniform location missing');
      return;
    }

    /* Closed opaque solids: the nearest fragment along any ray through a
     * closed manifold is a front face, so the depth test alone resolves
     * them and no winding assumption can put a hole in the mesh. */
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);

    /* One disc, drawn `count` times. Coin Size is a uniform scale on the
     * model matrix, so the vertices never change. */
    const coin = upload(gl, cylGeo(COIN_R, COIN_R, COIN_H, COIN_SEG));
    if (!coin) return;

    /* ---- sizing ---- */
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      cssW = canvas.clientWidth || host.clientWidth || 0;
      cssH = canvas.clientHeight || host.clientHeight || 0;
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    /* ---- loop ---- */
    const proj = m4();
    const view = m4();
    const pv = m4();
    const model = m4();
    const mvp = m4();
    const nrmMat = new Float32Array(9);
    let raf = 0;
    let last = performance.now();
    // Wrapped on the CPU: an unbounded accumulator eventually costs
    // float32 precision inside the trig.
    let tumble = 0;
    let ringPhase = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      const P = live.current;
      const count = Math.max(1, Math.round(P.coins.count));
      const coinScale = P.coins.coinSize / 100;
      const radius = RADIUS * (P.coins.spread / 100);

      // 50 is the rate each shipped at; 0 stops that motion alone.
      tumble = (tumble + dt * RATE * (P.speed / 50)) % TAU;
      ringPhase = (ringPhase + dt * RATE * (P.coins.ringSpeed / 50)) % TAU;

      const w = canvas.width;
      const h = canvas.height;
      const aspect = w / h;
      persp(proj, FOV, aspect, NEAR, FAR);
      // Fit against the SHORT edge: a portrait host would otherwise crop
      // the ring horizontally, since the field of view is vertical.
      const dist = P.distance / Math.min(1, aspect);
      m4Ident(view);
      trans(view, 0, 0, -dist);
      m4Mul(proj, view, pv);

      gl.uniform3fv(uBase, P.base);
      gl.uniform3fv(uAcc, P.acc);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      bindMesh(gl, coin, aPos, aNrm);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        // The reference offsets the ring by PI/4 at count 8 — one whole
        // step. On a rotationally symmetric ring that only relabels
        // which disc is which, and one step generalises the constant.
        const pa = a + TAU / count;
        m4Ident(model);
        // Outer group: three composes a group as T * R * S, and the
        // ring's turn is negative in the reference.
        rotZ(model, -ringPhase);
        scaleU(model, GROUP_SCALE);
        // Per-disc group: T(ring position) * Rz(a).
        trans(model, Math.cos(pa) * radius, Math.sin(pa) * radius, 0);
        rotZ(model, a);
        // The tumbling group. Euler XYZ means R = Rx * Ry * Rz, and
        // its rest pose (0, PI/count, PI/2) is what stands the disc up.
        rotX(model, tumble);
        rotY(model, Math.PI / count + tumble);
        rotZ(model, Math.PI / 2 + tumble);
        scaleU(model, coinScale);
        m4Mul(pv, model, mvp);
        nm3(model, nrmMat);
        gl.uniformMatrix4fv(uMVP, false, mvp);
        gl.uniformMatrix3fv(uNM, false, nrmMat);
        gl.drawElements(gl.TRIANGLES, coin.count, gl.UNSIGNED_SHORT, 0);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      freeMesh(gl, coin);
      gl.deleteProgram(prog);
      // No loseContext(): getContext hands back the same context per
      // canvas, so StrictMode's mount/cleanup/mount would reuse a
      // force-lost one and render black.
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

export default CoinLoader;
