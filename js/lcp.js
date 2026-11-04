(function () {
  var escena = document.querySelector('.heroe__escena');
  var img = document.querySelector('.heroe__lcp');
  if (!escena || !img || !escena.dataset.esquinas) return;
  var esquinas = JSON.parse(escena.dataset.esquinas);
  function adj(m) {
    return [
      m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
      m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
      m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
    ];
  }
  function mul(a, b) {
    var r = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var s = 0; for (var k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
      r[3 * i + j] = s;
    }
    return r;
  }
  function base(p) {
    var m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
    var a = adj(m);
    var v = [a[0] * p[3][0] + a[1] * p[3][1] + a[2], a[3] * p[3][0] + a[4] * p[3][1] + a[5], a[6] * p[3][0] + a[7] * p[3][1] + a[8]];
    return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  }
  var marco = document.querySelector('.heroe__capa--marco');
  function ubicar(e) {
    var re = escena.getBoundingClientRect(), rm = marco ? marco.getBoundingClientRect() : re;
    var tr = marco ? (getComputedStyle(marco).translate || 'none') : 'none';
    var ty = tr === 'none' ? 0 : parseFloat(tr.split(' ')[1] || '0') || 0;
    var W = rm.width, H = rm.height, dx = rm.left - re.left, dy = rm.top - re.top - ty;
    if (!W || !H) return;
    var dst = e.map(function (q) { return [dx + q[0] * W, dy + q[1] * H]; });
    var h = mul(base(dst), adj(base([[0, 0], [1280, 0], [1280, 720], [0, 720]])));
    for (var i = 0; i < 9; i++) h[i] /= h[8];
    var m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
    img.style.transform = 'matrix3d(' + m.map(function (v) { return v.toFixed(6); }).join(',') + ')';
    img.classList.add('ubicada');
  }
  window.__ubicarLcp = function (e) { ubicar(e || esquinas); };
  ubicar(esquinas);
  addEventListener('resize', function () { ubicar(esquinas); });
})();
