// Island: WebGL 3D Scene
// Pure WebGL torus — same rendering as the presto-c demo.
// Uses raw WebGL1 for maximum compatibility across devices.

import { defineIsland } from "../../src/islands/define";

function createScene(container: HTMLElement) {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "400px";
  canvas.style.borderRadius = "8px";
  canvas.style.display = "block";
  canvas.style.background = "#0a0a0f";
  container.appendChild(canvas);

  const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
  if (!gl) {
    container.innerHTML = '<div style="padding:2rem;text-align:center;color:#888">WebGL not available</div>';
    return;
  }

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  const vsrc = `
    attribute vec3 aPos, aNorm;
    uniform mat4 uProj, uView, uModel;
    varying vec3 vNorm, vPos;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vPos = w.xyz; vNorm = mat3(uModel) * aNorm;
      gl_Position = uProj * uView * w;
    }`;
  const fsrc = `
    precision mediump float;
    varying vec3 vNorm, vPos;
    uniform vec3 uColor, uLight;
    void main() {
      vec3 n = normalize(vNorm), l = normalize(uLight - vPos);
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(reflect(-l, n), normalize(-vPos)), 0.0), 32.0);
      float rim = 1.0 - max(dot(n, normalize(-vPos)), 0.0);
      vec3 col = uColor*0.15 + uColor*diff*0.7 + vec3(1.0)*spec*0.3 + uColor*pow(rim,3.0)*0.4;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function sh(t: number, s: string) { const o=gl!.createShader(t)!; gl!.shaderSource(o,s); gl!.compileShader(o); return o; }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog); gl.useProgram(prog);

  // Torus geometry
  const R=1.8, r=0.65, N=80, M=40;
  const verts: number[]=[], norms: number[]=[], idx: number[]=[];
  for (let i=0;i<=N;i++) {
    const u=(i/N)*Math.PI*2, cu=Math.cos(u), su=Math.sin(u);
    for (let j=0;j<=M;j++) {
      const v=(j/M)*Math.PI*2, cv=Math.cos(v), sv=Math.sin(v);
      verts.push((R+r*cv)*cu, r*sv, (R+r*cv)*su);
      norms.push(cv*cu, sv, cv*su);
    }
  }
  for (let i=0;i<N;i++) for (let j=0;j<M;j++) {
    const a=i*(M+1)+j, b=a+M+1;
    idx.push(a,b,a+1,b,b+1,a+1);
  }

  function buf(data: Float32Array|Uint16Array, type: number, attr?: string, size?: number) {
    const b=gl!.createBuffer(); gl!.bindBuffer(type,b); gl!.bufferData(type,data,gl!.STATIC_DRAW);
    if (attr!==undefined) { const loc=gl!.getAttribLocation(prog,attr); gl!.enableVertexAttribArray(loc); gl!.vertexAttribPointer(loc,size!,gl!.FLOAT,false,0,0); }
  }
  buf(new Float32Array(verts), gl.ARRAY_BUFFER, "aPos", 3);
  buf(new Float32Array(norms), gl.ARRAY_BUFFER, "aNorm", 3);
  buf(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER);

  const uProj=gl.getUniformLocation(prog,"uProj")!, uView=gl.getUniformLocation(prog,"uView")!,
        uModel=gl.getUniformLocation(prog,"uModel")!, uColor=gl.getUniformLocation(prog,"uColor")!,
        uLight=gl.getUniformLocation(prog,"uLight")!;

  function perspective(fov:number,a:number,n:number,f:number) {
    const t=1/Math.tan(fov/2),nf=1/(n-f);
    return new Float32Array([t/a,0,0,0,0,t,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0]);
  }
  function lookAt(e:number[],t:number[],u:number[]) {
    const s=(a:number[],b:number[])=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
    const c=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const d=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const n=(v:number[])=>{const l=Math.sqrt(d(v,v));return l?[v[0]/l,v[1]/l,v[2]/l]:[0,0,0]};
    const z=n(s(e,t)),x=n(c(u,z)),y=c(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-d(x,e),-d(y,e),-d(z,e),1]);
  }
  function rotY(a:number){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,s,0,0,1,0,0,-s,0,c,0,0,0,0,1])}
  function rotX(a:number){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,-s,0,0,s,c,0,0,0,0,1])}
  function mul(a:Float32Array,b:Float32Array){const o=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k];return o}

  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  gl.clearColor(0.039, 0.039, 0.059, 1.0);

  let mx=0, my=0;
  canvas.addEventListener("mousemove", e => {
    const r=canvas.getBoundingClientRect();
    mx=((e.clientX-r.left)/r.width-0.5)*2;
    my=((e.clientY-r.top)/r.height-0.5)*2;
  });

  function frame(t:number) {
    t*=0.001; resize();
    gl!.clear(gl!.COLOR_BUFFER_BIT|gl!.DEPTH_BUFFER_BIT);
    gl!.uniformMatrix4fv(uProj, false, perspective(0.8, canvas.width/canvas.height, 0.1, 100));
    gl!.uniformMatrix4fv(uView, false, lookAt([0,0,5.5],[0,0,0],[0,1,0]));
    gl!.uniformMatrix4fv(uModel, false, mul(rotY(t*0.25+mx*0.5), rotX(t*0.15+my*0.3)));
    gl!.uniform3fv(uColor, [99/255, 102/255, 241/255]);
    gl!.uniform3fv(uLight, [3,4,5]);
    gl!.drawElements(gl!.TRIANGLES, idx.length, gl!.UNSIGNED_SHORT, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const info = document.createElement("div");
  info.style.cssText = "font-size:0.7rem;color:#aaa;margin-top:0.5rem;font-family:system-ui,sans-serif";
  info.textContent = "Pure WebGL torus with rim lighting. Mouse to influence rotation. Bounded PRESTO island.";
  container.appendChild(info);
}

defineIsland({
  name: "three-scene",
  mount(el) {
    el.style.minHeight = "450px";
    createScene(el);
  },
});
