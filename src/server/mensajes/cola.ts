import { Db, tx, pool, q, q1, ex } from '../db';
import { nuevoId, param } from '../comun';
import { proveedorActual } from './proveedores';

/** 0991234567 -> 593991234567 ; deja solo digitos. */
export function normalizarTel(t?: string | null): string | null {
  if (!t) return null;
  let d = t.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '593' + d.slice(1);
  return d.length >= 11 ? d : null;
}

export async function encolar(db: Db, m: { dedupeKey: string; encomiendaId: string | null; tel?: string | null; plantilla: string; cuerpo: string }): Promise<boolean> {
  const tel = normalizarTel(m.tel);
  if (!tel) return false;
  if (m.encomiendaId) {
    const max = await param<number>(db, 'mensajes.max_por_encomienda', 5);
    const c = await q1<{ n: number }>(db, "SELECT COUNT(*) n FROM notificacion WHERE encomienda_id=? AND estado<>'descartada'", [m.encomiendaId]);
    if (Number(c?.n ?? 0) >= max) return false;
  }
  const r = await ex(db,
    'INSERT INTO notificacion(id,dedupe_key,encomienda_id,destinatario_tel,plantilla,cuerpo) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',
    [nuevoId(), m.dedupeKey.slice(0, 120), m.encomiendaId, tel, m.plantilla, m.cuerpo]);
  return r.affectedRows === 1;
}

export function despertarCola() {
  if (process.env.VITEST) return;
  // Intento 1: procesarCola en el mismo proceso (rápido, funciona en dev y en algunos entornos)
  setTimeout(() => { procesarCola().catch(() => {}); }, 50);
  // Intento 2: auto-llamada al endpoint del cron para garantizar envío inmediato en Vercel
  // (las funciones serverless pueden "morir" antes de que el setTimeout termine)
  const base = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const secret = process.env.CRON_SECRET;
  if (secret && base) {
    fetch(`${base}/api/cron/mensajes`, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
      signal: AbortSignal.timeout(20000),
    }).catch(() => { /* silencioso — el cron de cPanel lo reintentará igual */ });
  }
}

function permitido(tel: string): boolean {
  const permitidosConfig = (process.env.MENSAJES_NUMEROS_PERMITIDOS || '').trim();
  if (!permitidosConfig) return true; // Si está vacío, se permite enviar a cualquier número
  const lista = permitidosConfig.split(',').map(s => normalizarTel(s.trim())).filter(Boolean);
  return lista.includes(tel);
}

export async function procesarCola(limite = 20): Promise<{ procesadas: number; enviadas: number; fallidas: number }> {
  await ex(pool, "UPDATE notificacion SET estado='pendiente' WHERE estado='enviando' AND next_attempt_at < NOW(3) - INTERVAL 10 MINUTE");
  const lote = await tx(async c => {
    const ids = await q<{ id: string }>(c,
      "SELECT id FROM notificacion WHERE estado IN ('pendiente','fallida') AND next_attempt_at<=NOW(3) AND intentos<8 ORDER BY next_attempt_at LIMIT ? FOR UPDATE", [limite]);
    if (!ids.length) return [];
    await ex(c, "UPDATE notificacion SET estado='enviando', intentos=intentos+1, next_attempt_at=NOW(3) WHERE id IN (?)", [ids.map(i => i.id)]);
    return q<any>(c, 'SELECT * FROM notificacion WHERE id IN (?)', [ids.map(i => i.id)]);
  });
  const prov = proveedorActual();
  let enviadas = 0, fallidas = 0;
  for (const n of lote) {
    try {
      // Modo prueba: con Evolution (mensajes REALES) solo se envia a numeros permitidos.
      if (prov.nombre === 'evolution' && !permitido(n.destinatario_tel)) {
        await ex(pool, "UPDATE notificacion SET estado='descartada', ultimo_error='modo_prueba: numero no permitido' WHERE id=?", [n.id]);
        continue;
      }
      const r = await prov.enviar(n.destinatario_tel, n.cuerpo);
      // Con proveedor real el codigo de retiro se redacta tras enviarse.
      const cuerpo = prov.nombre === 'evolution' && n.plantilla === 'disponible_retiro' ? n.cuerpo.replace(/\b\d{6}\b/, '******') : n.cuerpo;
      await ex(pool, "UPDATE notificacion SET estado='enviada', proveedor_msg_id=?, enviada_at=NOW(3), ultimo_error=NULL, cuerpo=? WHERE id=?", [r.id, cuerpo, n.id]);
      enviadas++;
    } catch (e: any) {
      fallidas++;
      const espera = Math.min(60, 2 ** Number(n.intentos));
      await ex(pool, "UPDATE notificacion SET estado='fallida', ultimo_error=?, next_attempt_at=NOW(3) + INTERVAL ? MINUTE WHERE id=?",
        [String(e?.message ?? e).slice(0, 500), espera, n.id]);
    }
  }
  return { procesadas: lote.length, enviadas, fallidas };
}
