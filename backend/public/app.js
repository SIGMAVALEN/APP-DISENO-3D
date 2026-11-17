// Completa la web con datos del servidor: link del APK (variable APK_URL en Render),
// el QR y el estado. Sirve para index.html y descargar.html.
(async () => {
  const estado = document.getElementById('estado');
  const nota = document.getElementById('apk-nota');
  const qr = document.getElementById('qr');
  const botones = document.querySelectorAll('[data-apk]');
  // Si el servicio de QR no responde, se oculta el recuadro en vez de mostrar una imagen rota.
  if (qr) qr.addEventListener('error', () => { const f = qr.closest('figure'); if (f) f.hidden = true; });
  const qrDe = (url) => `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(url)}`;

  try {
    const r = await fetch('/api/public/info');
    const info = await r.json();
    if (estado) {
      estado.textContent = `● Servidor en línea · ${info.ejercicios} ejercicios · ${info.usuarios} usuarios`;
      estado.classList.add('ok');
    }
    if (info.apkUrl) {
      botones.forEach((b) => { b.href = info.apkUrl; b.setAttribute('download', ''); });
      if (qr) qr.src = qrDe(info.apkUrl);
    } else {
      if (nota) nota.textContent = 'El APK todavía no fue publicado. Volvé a intentar más tarde.';
      // Sin APK, el QR lleva a esta misma página para abrirla en el celular.
      if (qr) qr.src = qrDe(location.href);
    }
  } catch {
    if (estado) estado.textContent = '● El servidor está iniciando, recargá en unos segundos.';
    if (qr) qr.src = qrDe(location.href);
  }
})();
