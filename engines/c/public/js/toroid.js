// WebGL Toroidal Shape — Pure client territory
// The PRESTO engine never touches this file. It's served as a static asset.

(function() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) { console.warn('WebGL not available'); return; }

  // Resize
  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  // Shaders
  const vsrc = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    varying vec3 vNorm;
    varying vec3 vPos;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      vPos = world.xyz;
      vNorm = mat3(uModel) * aNorm;
      gl_Position = uProj * uView * world;
    }
  `;

  const fsrc = `
    precision mediump float;
    varying vec3 vNorm;
    varying vec3 vPos;
    uniform vec3 uColor;
    uniform vec3 uLight;
    void main() {
      vec3 n = normalize(vNorm);
      vec3 l = normalize(uLight - vPos);
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(reflect(-l, n), normalize(-vPos)), 0.0), 32.0);
      vec3 ambient = uColor * 0.12;
      vec3 col = ambient + uColor * diff * 0.7 + vec3(1.0) * spec * 0.35;
      // Edge glow
      float rim = 1.0 - max(dot(n, normalize(-vPos)), 0.0);
      col += uColor * pow(rim, 3.0) * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Generate torus
  const R = 1.8, r = 0.65;       // Major/minor radius
  const N = 96, M = 48;           // Segments
  const verts = [], norms = [], idx = [];

  for (let i = 0; i <= N; i++) {
    const u = (i / N) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= M; j++) {
      const v = (j / M) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const x = (R + r * cv) * cu;
      const y = r * sv;
      const z = (R + r * cv) * su;
      verts.push(x, y, z);
      // Normal = direction from center of tube to surface
      norms.push(cv * cu, sv, cv * su);
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // Buffers
  function buf(data, type, attr, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(type, b);
    gl.bufferData(type, data, gl.STATIC_DRAW);
    if (attr !== undefined) {
      const loc = gl.getAttribLocation(prog, attr);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    return b;
  }

  buf(new Float32Array(verts), gl.ARRAY_BUFFER, 'aPos', 3);
  buf(new Float32Array(norms), gl.ARRAY_BUFFER, 'aNorm', 3);
  buf(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER);

  // Uniforms
  const uProj = gl.getUniformLocation(prog, 'uProj');
  const uView = gl.getUniformLocation(prog, 'uView');
  const uModel = gl.getUniformLocation(prog, 'uModel');
  const uColor = gl.getUniformLocation(prog, 'uColor');
  const uLight = gl.getUniformLocation(prog, 'uLight');

  // Matrix helpers
  function perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f/aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far+near)*nf, -1,
      0, 0, 2*far*near*nf, 0
    ]);
  }

  function lookAt(eye, target, up) {
    const z = normalize3(sub3(eye, target));
    const x = normalize3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x,eye), -dot3(y,eye), -dot3(z,eye), 1
    ]);
  }

  function rotateY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]);
  }
  function rotateX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]);
  }
  function mul4(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++)
          o[j*4+i] += a[k*4+i] * b[j*4+k];
    return o;
  }

  function sub3(a,b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function cross3(a,b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function dot3(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function normalize3(v) { const l=Math.sqrt(dot3(v,v)); return l?[v[0]/l,v[1]/l,v[2]/l]:[0,0,0]; }

  // Render
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0.039, 0.039, 0.059, 1.0); // matches --bg

  const accent = [99/255, 102/255, 241/255]; // --accent #6366f1

  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function frame(t) {
    t *= 0.001;
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    gl.uniformMatrix4fv(uProj, false, perspective(0.8, aspect, 0.1, 100));
    gl.uniformMatrix4fv(uView, false, lookAt([0, 0, 5.5], [0, 0, 0], [0, 1, 0]));

    // Slow rotation + mouse influence
    const rx = t * 0.15 + mouseY * 0.3;
    const ry = t * 0.25 + mouseX * 0.5;
    gl.uniformMatrix4fv(uModel, false, mul4(rotateY(ry), rotateX(rx)));

    gl.uniform3fv(uColor, accent);
    gl.uniform3fv(uLight, [3, 4, 5]);

    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
