// Completa la web con datos del servidor: link del APK (variable APK_URL en Render) y estado.
(async () => {
  const estado = document.getElementById('estado');
  const botones = [document.getElementById('btn-apk'), document.getElementById('btn-apk-2')];
  const nota = document.getElementById('apk-nota');
  const qr = document.getElementById('qr');
  try {
    const r = await fetch('/api/public/info');
    const info = await r.json();
    estado.textContent = `● Servidor en línea · ${info.ejercicios} ejercicios · ${info.usuarios} usuarios registrados`;
    estado.classList.add('ok');
    const destino = info.apkUrl || '';
    if (destino) {
      botones.forEach((b) => { b.href = destino; b.setAttribute('download', ''); });
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(destino)}`;
    } else {
      nota.textContent = 'El APK todavía no fue publicado. Volvé a intentar más tarde.';
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(location.href)}`;
    }
  } catch {
    estado.textContent = '● El servidor está iniciando, recargá en unos segundos.';
  }
})();
