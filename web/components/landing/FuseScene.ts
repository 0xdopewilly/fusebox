import * as THREE from "three";

export interface Anchor { x: number; y: number }
export interface FuseSceneOpts {
  onFrame?: (anchors: Anchor[]) => void;
  onBlow?: (blown: boolean) => void;
}

const BAYER_DITHER = `uniform sampler2D t;uniform vec2 res;uniform float px;uniform float reveal;uniform float flash;
float b2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float b8(vec2 a){return b4(.5*a)*.25+b2(a);}
void main(){vec2 cell=floor(gl_FragCoord.xy/px);vec2 uv=(cell*px+px*.5)/res;
  float L=dot(texture2D(t,uv).rgb,vec3(.299,.587,.114));
  vec2 f=fract(gl_FragCoord.xy/px);float on=step(f.x,.76)*step(f.y,.76);float th=b8(cell);
  vec3 col=vec3(0.);
  if(L>.9)col=mix(vec3(.97,1.,.92),vec3(1.,.32,.2),flash);
  else if(L>th*.72+.2)col=mix(vec3(.733,.996,.184),vec3(1.,.32,.2),flash*.85);
  else if(L>th*.3+.05)col=vec3(.16,.23,.05);
  if(th>reveal)col=vec3(0.);
  float a=on*step(.001,max(col.r,max(col.g,col.b)));
  gl_FragColor=vec4(col*a,a);}`;

/**
 * A glass cartridge fuse in three.js, post-processed into ordered-dither dots.
 * It rolls on its axis, leans toward the pointer, and blows (filament breaks, sparks) on a cycle or on demand.
 */
export class FuseScene {
  private renderer: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private post = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private outer = new THREE.Group();
  private roll = new THREE.Group();
  private curve: THREE.CatmullRomCurve3;
  private fL: THREE.Mesh; private fM: THREE.Mesh; private fR: THREE.Mesh; private halo: THREE.Mesh;
  private hot = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private cold = new THREE.MeshBasicMaterial({ color: 0x585858 });
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private dm: THREE.ShaderMaterial;
  private raf = 0;
  private running = false;
  private t0 = performance.now();
  private blownAt = -1;
  private nextBlow = 5.2;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private opts: FuseSceneOpts;
  private W = 1; private H = 1; private DPR = 1; private PX = 3;
  private fixedT: number | null;
  /** WebGL drawn on the CPU (SwiftShader, llvmpipe: no GPU, VMs, audit tools): render lighter so the page stays responsive */
  private soft = false;
  reveal = { v: 0 };

  constructor(private canvas: HTMLCanvasElement, opts: FuseSceneOpts = {}) {
    this.opts = opts;
    const q = new URLSearchParams(location.search).get("t");
    this.fixedT = q !== null ? Number(q) : null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: this.fixedT !== null });
    this.renderer.setClearColor(0x000000, 0);
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      this.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
    } catch { /* keep defaults */ }
    this.rt = new THREE.WebGLRenderTarget(4, 4);
    this.cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    this.scene.background = new THREE.Color(0x000000);
    this.outer.add(this.roll);
    this.scene.add(this.outer);
    this.outer.rotation.set(0.08, -0.42, -0.06);

    // brass end caps: lathe profile with crimp bands, axis along x
    const prof = [[0, 0], [0.66, 0], [0.7, 0.04], [0.7, 0.16], [0.64, 0.2], [0.64, 0.3], [0.7, 0.34], [0.7, 0.46], [0.64, 0.5], [0.64, 0.88], [0.69, 0.92], [0.69, 1.08], [0.62, 1.14], [0.5, 1.14], [0.5, 1.2], [0, 1.2]].map(([r, h]) => new THREE.Vector2(r, h));
    const capGeo = new THREE.LatheGeometry(prof, 96);
    const metal = new THREE.MeshPhongMaterial({ color: 0xbdbdbd, specular: 0xffffff, shininess: 46 });
    const capL = new THREE.Mesh(capGeo, metal); capL.rotation.z = -Math.PI / 2; capL.position.x = -2.95; this.roll.add(capL);
    const capR = new THREE.Mesh(capGeo, metal); capR.rotation.z = Math.PI / 2; capR.position.x = 2.95; this.roll.add(capR);

    // glass tube: fresnel rim and a specular streak
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 3.6, 96, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `varying vec3 vN;varying vec3 vV;void main(){vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;float f=pow(1.-abs(dot(n,vV)),3.2);vec3 r=reflect(-normalize(vec3(.3,.9,.5)),n);float sp=pow(max(dot(r,vV),0.),48.);gl_FragColor=vec4(vec3(f*1.15+sp*1.6),1.);}`,
      }),
    );
    glass.rotation.z = Math.PI / 2; this.roll.add(glass);

    // filament: zigzag in three parts so the middle can blow
    const N = 60, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) { const t = i / N, env = Math.sin(t * Math.PI); pts.push(new THREE.Vector3(-1.8 + 3.6 * t, Math.sin(t * Math.PI * 7) * 0.24 * env, Math.cos(t * Math.PI * 7) * 0.12 * env)); }
    this.curve = new THREE.CatmullRomCurve3(pts);
    const part = (a: number, b: number, r: number) => { const sub: THREE.Vector3[] = []; for (let i = 0; i <= 40; i++) sub.push(this.curve.getPoint(a + ((b - a) * i) / 40)); return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sub), 120, r, 10, false); };
    this.fL = new THREE.Mesh(part(0, 0.47, 0.034), this.hot);
    this.fM = new THREE.Mesh(part(0.47, 0.53, 0.034), this.hot);
    this.fR = new THREE.Mesh(part(0.53, 1, 0.034), this.hot);
    this.halo = new THREE.Mesh(part(0, 1, 0.11), new THREE.MeshBasicMaterial({ color: 0x6a6a6a, transparent: true, opacity: 0.55, depthWrite: false }));
    this.roll.add(this.fL, this.fM, this.fR, this.halo);

    const sg = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(sg, this.hot); m.visible = false; this.roll.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0 }); }

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    const fill = new THREE.DirectionalLight(0xffffff, 1.1); fill.position.set(-5, 2.5, 6); this.scene.add(fill);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(-6, -1.5, -3); this.scene.add(rim);

    this.dm = new THREE.ShaderMaterial({
      uniforms: { t: { value: this.rt.texture }, res: { value: new THREE.Vector2() }, px: { value: 3 }, reveal: { value: 0 }, flash: { value: 0 } },
      vertexShader: `void main(){gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: BAYER_DITHER,
    });
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dm));
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.DPR = this.soft ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.PX = 3 * this.DPR;
    this.renderer.setPixelRatio(this.DPR);
    this.renderer.setSize(this.W, this.H, false);
    this.rt.setSize(Math.ceil((this.W * this.DPR) / this.PX) * 2, Math.ceil((this.H * this.DPR) / this.PX) * 2);
    this.dm.uniforms.res.value.set(this.W * this.DPR, this.H * this.DPR);
    this.dm.uniforms.px.value = this.PX;
    this.cam.aspect = this.W / this.H;
    const narrow = this.W < 700;
    this.cam.position.set(0, 1.25, narrow ? 12.8 : 9.4);
    this.cam.lookAt(0.15, -0.1, 0);
    this.cam.updateProjectionMatrix();
    if (!this.running) this.render(this.time());
  }

  /** pointer in -1..1 across the hero */
  setPointer(x: number, y: number) { this.pointer.tx = x; this.pointer.ty = y; }

  private time() { return this.fixedT ?? (performance.now() - this.t0) / 1000; }

  blow() {
    const t = this.time();
    if (this.blownAt >= 0 && t - this.blownAt < 1.6) return;
    this.blownAt = t;
    const o = this.curve.getPoint(0.5);
    this.sparks.forEach((s) => { s.m.position.copy(o); s.v.set((Math.random() - 0.5) * 3.2, Math.random() * 3.4, (Math.random() - 0.5) * 3.2); s.life = 0.55 + Math.random() * 0.4; s.m.visible = true; });
    this.dm.uniforms.flash.value = 1;
    this.opts.onBlow?.(true);
  }

  private anchors(): Anchor[] {
    this.roll.updateMatrixWorld(true);
    return [this.curve.getPoint(0.3), new THREE.Vector3(-3.55, 0, 0), this.curve.getPoint(0.5)].map((p) => {
      const v = p.clone().applyMatrix4(this.roll.matrixWorld).project(this.cam);
      return { x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H };
    });
  }

  private lastT = 0;
  private render(t: number) {
    const dt = Math.min(0.05, Math.max(0, t - this.lastT)); this.lastT = t;
    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.06; p.y += (p.ty - p.y) * 0.06;
    this.roll.rotation.x = t * 0.45;
    this.outer.rotation.y = -0.42 + p.x * 0.22;
    this.outer.rotation.x = 0.08 + p.y * 0.12;
    this.outer.position.y = Math.sin(t * 0.7) * 0.05;

    // auto cycle: blow, hold, restore
    if (this.fixedT === null && t > this.nextBlow) { this.blow(); this.nextBlow = t + 7; }
    if (this.fixedT !== null && this.fixedT > 5.2 && this.blownAt < 0) this.blow();
    const since = this.blownAt >= 0 ? t - this.blownAt : Infinity;
    const blown = since < 1.6 || (this.fixedT !== null && this.blownAt >= 0);
    if (!blown && this.blownAt >= 0 && since < 1.7) this.opts.onBlow?.(false);
    this.fM.visible = !blown; this.halo.visible = !blown;
    this.fL.material = this.fR.material = blown ? this.cold : this.hot;
    this.dm.uniforms.flash.value = Math.max(0, this.dm.uniforms.flash.value - dt * 3.2);
    this.sparks.forEach((s) => {
      if (!s.m.visible) return;
      s.life -= dt; s.v.y -= 6 * dt; s.m.position.addScaledVector(s.v, dt);
      if (s.life <= 0) s.m.visible = false;
    });
    this.dm.uniforms.reveal.value = this.reveal.v;

    this.renderer.setRenderTarget(this.rt); this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(null); this.renderer.render(this.post, this.pcam);
    this.opts.onFrame?.(this.anchors());
  }

  start() {
    if (this.running) return;
    this.running = true;
    // on a GPU every frame; drawn on the CPU, about 10 a second (the motion keeps its timing, it's just steppier)
    let last = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      if (!this.soft || now - last > 95) { last = now; this.render(this.time()); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  dispose() { this.stop(); this.renderer.dispose(); this.rt.dispose(); }
}
