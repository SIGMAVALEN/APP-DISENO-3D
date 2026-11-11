// Envío de emails por API HTTP (Render free bloquea los puertos SMTP).
// Proveedores soportados: Brevo (300 mails/día gratis, a cualquier destinatario
// con un remitente verificado) o Resend. Sin proveedor configurado, el código
// se imprime en los logs del servidor.
import { config } from '../config.js';

function parseFrom(from) {
  const m = from.match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: 'BlendGO!', email: from.trim() };
}

export async function enviarEmail({ to, subject, html, text }) {
  if (config.brevoApiKey) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(config.mailFrom), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${await r.text()}`);
    return true;
  }
  if (config.resendApiKey) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${await r.text()}`);
    return true;
  }
  console.log(`[mail] (sin proveedor configurado) Para: ${to} | ${subject}\n${text}`);
  return false;
}

export function plantillaCodigo(nombre, codigo) {
  const text = `Hola ${nombre}, tu código para restablecer la contraseña de BlendGO! es ${codigo}. Vence en 15 minutos. Si no lo pediste, ignorá este mensaje.`;
  const html = `
  <div style="font-family:Arial,sans-serif;background:#0F1117;color:#F9FAFB;padding:32px">
    <div style="max-width:440px;margin:auto;background:#1E222D;border-radius:16px;padding:28px">
      <h2 style="margin:0 0 8px;color:#6366F1">BlendGO!</h2>
      <p>Hola ${escapeHtml(nombre)}, recibimos un pedido para restablecer tu contraseña.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#10B981;text-align:center;margin:24px 0">${codigo}</p>
      <p style="color:#9CA3AF;font-size:13px">El código vence en 15 minutos. Si no lo pediste, ignorá este mensaje.</p>
    </div>
  </div>`;
  return { text, html };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
