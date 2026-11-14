import { Db, q, q1 } from '../db';
import { ErrorNegocio } from '../comun';

export async function panel(db: Db) {
  const porEstado = await q<any>(db, 'SELECT estado, COUNT(*) n FROM bulto GROUP BY estado ORDER BY n DESC');
  const redespachos = await q<any>(db,
    `SELECT r.id,r.due_at,(r.due_at<NOW(3)) vencido,b.codigo_legible,e.codigo enc_codigo,a.nombre agencia,ad.nombre destino
       FROM redespacho r JOIN bulto b ON b.id=r.bulto_id JOIN encomienda e ON e.id=b.encomienda_id
       JOIN agencia a ON a.id=r.agencia_resp_id JOIN agencia ad ON ad.id=e.destino_agencia_id
      WHERE r.cerrado_at IS NULL ORDER BY r.due_at LIMIT 20`);
  const incidencias = await q<any>(db,
    `SELECT i.id,i.tipo,i.abierta_at,b.codigo_legible FROM incidencia i LEFT JOIN bulto b ON b.id=i.bulto_id WHERE i.resuelta_at IS NULL ORDER BY i.abierta_at DESC LIMIT 20`);
  const disponibles = await q<any>(db,
    `SELECT e.id,e.codigo,e.dest_nombre,a.nombre destino,v.estado FROM v_encomienda_estado v JOIN encomienda e ON e.id=v.id JOIN agencia a ON a.id=e.destino_agencia_id
      WHERE v.estado IN ('disponible_retiro','parcialmente_disponible') ORDER BY e.creado_at DESC LIMIT 20`);
  const sinViaje = await q1<any>(db, "SELECT COUNT(*) n FROM bulto WHERE estado='registrado'");
  const porRecibir = await q<any>(db, `SELECT b.id,b.codigo_legible,e.codigo enc_codigo,a.nombre agencia FROM bulto b JOIN encomienda e ON e.id=b.encomienda_id LEFT JOIN agencia a ON a.id=b.agencia_custodia_id WHERE b.estado='descargado' LIMIT 20`);
  const viajes = await q<any>(db,
    `SELECT v.id, v.vehiculo, v.estado, v.parada_actual, v.conductor, v.ayudante,
            r.nombre AS ruta,
            p.nombre AS parada_nombre,
            (SELECT COUNT(*) FROM manifiesto_item mi
               JOIN manifiesto m ON m.id=mi.manifiesto_id
               JOIN bulto b ON b.id = mi.bulto_id
              WHERE m.viaje_id=v.id
                AND m.version=(SELECT MAX(version) FROM manifiesto WHERE viaje_id=v.id)
                AND b.estado IN ('pendiente_despacho','cargado','en_transito')) AS items,
            (SELECT COUNT(*) FROM manifiesto_item mi
               JOIN manifiesto m ON m.id=mi.manifiesto_id
              WHERE m.viaje_id=v.id
                AND m.version=(SELECT MAX(version) FROM manifiesto WHERE viaje_id=v.id)) AS items_total,
            (SELECT MAX(version) FROM manifiesto WHERE viaje_id=v.id AND cerrado_at IS NOT NULL) AS version_cerrada,
            (SELECT COUNT(*) FROM manifiesto WHERE viaje_id=v.id AND cerrado_at IS NOT NULL) AS tiene_manifiesto_cerrado,
            (SELECT COUNT(*) FROM autorizacion_salida a WHERE a.viaje_id=v.id AND a.parada_orden=v.parada_actual AND a.invalidada_at IS NULL) AS autorizada_salida,
            (SELECT COUNT(*) FROM autorizacion_salida a WHERE a.viaje_id=v.id AND a.parada_orden=v.parada_actual AND a.salida_real_at IS NOT NULL) AS salida_real_registrada
       FROM viaje v
       JOIN ruta r ON r.id = v.ruta_id
  LEFT JOIN parada p ON p.ruta_id = v.ruta_id AND p.orden = v.parada_actual
      WHERE v.estado <> 'cerrado'
      ORDER BY (items > 0) DESC, v.fecha DESC, v.id DESC
      LIMIT 15`);
  const excepciones = await q<any>(db,
    `SELECT a.id,a.autorizado_at,a.motivo,a.viaje_id,a.parada_orden,u.nombre autorizado_por FROM autorizacion_salida a JOIN usuario u ON u.id=a.autorizado_por
      WHERE a.tipo='excepcion_a' ORDER BY a.autorizado_at DESC LIMIT 10`);
  const modificaciones = await q<any>(db,
    `SELECT e.recibido_servidor,e.viaje_id,e.payload,u.nombre FROM evento e JOIN usuario u ON u.id=e.actor_id WHERE e.tipo='manifiesto_modificado' ORDER BY e.recibido_servidor DESC LIMIT 10`);
  return { porEstado, redespachos, incidencias, disponibles, sinViaje: Number(sinViaje?.n ?? 0), porRecibir, viajes, excepciones, modificaciones };
}

export async function lineaDeTiempo(db: Db, bultoId: string) {
  const b = await q1<any>(db,
    `SELECT b.id,b.codigo_legible,b.numero,b.estado,e.codigo enc_codigo,e.dest_nombre,ao.nombre origen,ad.nombre destino
       FROM bulto b JOIN encomienda e ON e.id=b.encomienda_id JOIN agencia ao ON ao.id=e.origen_agencia_id JOIN agencia ad ON ad.id=e.destino_agencia_id WHERE b.id=?`, [bultoId]);
  if (!b) throw new ErrorNegocio('NO_ENCONTRADO', 'Bulto no encontrado', undefined, 404);
  const eventos = await q<any>(db,
    `SELECT ev.id,ev.tipo,ev.resultado,ev.parada_orden,ev.recibido_servidor,ev.payload,u.nombre actor
       FROM evento ev JOIN usuario u ON u.id=ev.actor_id WHERE ev.bulto_id=? ORDER BY ev.recibido_servidor, ev.id`, [bultoId]);
  return { bulto: b, eventos };
}

export async function buscarBultoPorCodigo(db: Db, codigo: string) {
  const { buscarBulto } = await import('./manifiesto');
  const b = await buscarBulto(db, codigo);
  if (!b) throw new ErrorNegocio('BULTO_NO_ENCONTRADO', 'No existe un bulto con ese codigo', undefined, 404);
  return { id: b.id };
}

export const listarMensajes = (db: Db) =>
  q<any>(db, `SELECT n.id,n.plantilla,n.destinatario_tel,n.cuerpo,n.estado,n.intentos,n.ultimo_error,n.creado_at,n.enviada_at,e.codigo enc_codigo
                FROM notificacion n LEFT JOIN encomienda e ON e.id=n.encomienda_id ORDER BY n.creado_at DESC LIMIT 100`);

export async function csvEventos(db: Db): Promise<string> {
  const rows = await q<any>(db,
    `SELECT ev.recibido_servidor,ev.tipo,ev.resultado,b.codigo_legible bulto,ev.viaje_id,ev.parada_orden,u.nombre actor
       FROM evento ev LEFT JOIN bulto b ON b.id=ev.bulto_id JOIN usuario u ON u.id=ev.actor_id ORDER BY ev.recibido_servidor DESC LIMIT 20000`);
  const esc = (v: any) => { const s = v instanceof Date ? v.toISOString() : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ['recibido_servidor', 'tipo', 'resultado', 'bulto', 'viaje_id', 'parada_orden', 'actor'];
  return '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
