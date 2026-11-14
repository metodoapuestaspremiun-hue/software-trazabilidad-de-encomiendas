import { Db, tx, q, q1, ex, pj, pool } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento, param } from '../comun';
import { evaluarSalida, describirBloqueo, type ItemParada } from '@/domain/salida';
import { encolar, despertarCola } from '../mensajes/cola';
import { T } from '../mensajes/plantillas';

const DESCARGADO_LIKE = ['descargado', 'recibido_agencia', 'pendiente_redespacho', 'disponible_retiro', 'entregado', 'devuelto'];

export async function cargarContextoSalida(db: Db, viajeId: string, paradaOrden: number) {
  const viaje = await q1<any>(db, 'SELECT * FROM viaje WHERE id=?', [viajeId]);
  if (!viaje) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
  const parada = await q1<any>(db, 'SELECT * FROM parada WHERE ruta_id=? AND orden=?', [viaje.ruta_id, paradaOrden]);
  if (!parada) throw new ErrorNegocio('PARADA_NO_ENCONTRADA', 'Parada no encontrada', undefined, 404);
  const version = (await q1<any>(db, 'SELECT MAX(version) v FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NOT NULL', [viajeId]))?.v;
  if (!version) throw new ErrorNegocio('SIN_MANIFIESTO', 'El viaje no tiene manifiesto cerrado');

  const filas = await q<any>(db,
    `SELECT mi.bulto_id,mi.sube_orden,mi.baja_orden,b.estado,b.codigo_legible,b.numero,e.codigo enc_codigo
       FROM manifiesto_item mi JOIN manifiesto m ON m.id=mi.manifiesto_id JOIN bulto b ON b.id=mi.bulto_id JOIN encomienda e ON e.id=b.encomienda_id
      WHERE m.viaje_id=? AND m.version=? AND mi.sube_orden<=? AND mi.baja_orden>=? AND b.estado<>'anulado'
      ORDER BY e.codigo, b.numero`, [viajeId, version, paradaOrden, paradaOrden]);
  const items: ItemParada[] = filas.map(f => ({ bultoId: f.bulto_id, rol: f.baja_orden === paradaOrden ? 'baja' : f.sube_orden === paradaOrden ? 'sube' : 'continua' }));
  const rolDe = new Map(items.map(i => [i.bultoId, i.rol]));
  const cargadosValidos = new Set(filas.filter(f => rolDe.get(f.bulto_id) === 'sube' && f.estado === 'cargado').map(f => f.bulto_id));
  const descargados = new Set(filas.filter(f => rolDe.get(f.bulto_id) === 'baja' && DESCARGADO_LIKE.includes(f.estado)).map(f => f.bulto_id));

  const ids = filas.map(f => f.bulto_id);
  const faltantes = ids.length ? await q<any>(db, "SELECT DISTINCT bulto_id FROM incidencia WHERE tipo='faltante' AND resuelta_at IS NULL AND bulto_id IN (?)", [ids]) : [];
  const conflictos = await q1<any>(db, "SELECT COUNT(*) n FROM incidencia WHERE viaje_id=? AND tipo IN ('sobrante','descarga_incorrecta') AND resuelta_at IS NULL", [viajeId]);
  const cnt = await q1<any>(db, "SELECT payload FROM evento WHERE tipo='conteo_continuan' AND viaje_id=? AND parada_orden=? ORDER BY recibido_servidor DESC, id DESC LIMIT 1", [viajeId, paradaOrden]);
  const conteo = cnt ? Number(pj<any>(cnt.payload)?.conteo) : null;
  const reesc = await q<any>(db, "SELECT DISTINCT bulto_id FROM evento WHERE tipo='escaneo_carga' AND resultado='ya_a_bordo' AND viaje_id=? AND parada_orden=?", [viajeId, paradaOrden]);
  const exigirReescaneo = await param<boolean>(db, 'exigir_reescaneo_continuan', false);

  const evaluacion = evaluarSalida({
    items, cargadosValidos, descargados, faltantesAbiertos: new Set(faltantes.map(f => f.bulto_id)),
    conteoContinuan: Number.isFinite(conteo) ? conteo : null, reescaneados: new Set(reesc.map(r => r.bulto_id)),
    exigirReescaneo, conflictosCriticos: Number(conflictos?.n ?? 0),
  });
  const detalle = filas.map(f => ({ bultoId: f.bulto_id, codigo: f.codigo_legible, numero: f.numero, encomienda: f.enc_codigo, rol: rolDe.get(f.bulto_id)!, estado: f.estado }));
  return { viaje, parada, version: version as number, items, detalle, evaluacion, conteo: Number.isFinite(conteo) ? conteo : null };
}

/** Lo que muestra la pantalla de la parada (solo lectura). */
export async function vistaParada(db: Db, viajeId: string, paradaOrden: number) {
  const c = await cargarContextoSalida(db, viajeId, paradaOrden);
  const aut = await q1<any>(db, 'SELECT id,tipo,autorizado_at,salida_real_at,manifiesto_version FROM autorizacion_salida WHERE viaje_id=? AND parada_orden=? AND invalidada_at IS NULL', [viajeId, paradaOrden]);
  const incidencias = await q<any>(db,
    `SELECT i.id,i.tipo,i.abierta_at,b.codigo_legible FROM incidencia i LEFT JOIN bulto b ON b.id=i.bulto_id
      WHERE i.viaje_id=? AND i.resuelta_at IS NULL ORDER BY i.abierta_at`, [viajeId]);
  return {
    viaje: { id: c.viaje.id, estado: c.viaje.estado, parada_actual: c.viaje.parada_actual }, parada: { orden: c.parada.orden, nombre: c.parada.nombre },
    version: c.version, bultos: c.detalle, conteo: c.conteo,
    evaluacion: { ...c.evaluacion, mensajes: c.evaluacion.bloqueos.map(describirBloqueo) },
    autorizacion: aut ?? null, incidencias,
  };
}

export async function registrarConteo(actorId: string, i: { viajeId: string; parada: number; conteo: number }) {
  const ctx = await cargarContextoSalida(pool, i.viajeId, i.parada);
  await registrarEvento(pool, { tipo: 'conteo_continuan', viajeId: i.viajeId, parada: i.parada, actorId, payload: { conteo: i.conteo, version: ctx.version } });
  return { ok: true };
}

export async function autorizarSalida(actorId: string, c: { viajeId: string; parada: number; tipo: 'normal' | 'excepcion_a'; solicitadoPor?: string; motivo?: string }) {
  return tx(async db => {
    const viaje = await q1<any>(db, 'SELECT * FROM viaje WHERE id=? FOR UPDATE', [c.viajeId]);
    if (!viaje) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
    if (!['manifiesto_cerrado', 'en_ruta'].includes(viaje.estado)) throw new ErrorNegocio('VIAJE_NO_OPERABLE', 'El viaje no esta listo para salir');
    if (c.parada !== viaje.parada_actual) throw new ErrorNegocio('PARADA_NO_ACTUAL', `El bus esta en la parada ${viaje.parada_actual}`);
    const ctx = await cargarContextoSalida(db, c.viajeId, c.parada);
    const r = ctx.evaluacion;

    if (c.tipo === 'normal') {
      if (!r.normalPermitida) throw new ErrorNegocio('SALIDA_BLOQUEADA', 'La carga no concilia con el manifiesto', { bloqueos: r.bloqueos, mensajes: r.bloqueos.map(describirBloqueo) });
    } else {
      if (r.normalPermitida) throw new ErrorNegocio('NO_HACE_FALTA_EXCEPCION', 'La carga concilia: usa la autorizacion normal');
      if (r.excepcionPermitida !== 'A') throw new ErrorNegocio('NO_EXCEPCIONABLE', 'Hay bloqueos que primero deben resolverse (incidencias sin resolver)', { mensajes: r.bloqueos.map(describirBloqueo) });
      if (!c.motivo?.trim()) throw new ErrorNegocio('MOTIVO_OBLIGATORIO', 'La excepcion exige motivo', undefined, 400);
      if (!c.solicitadoPor) throw new ErrorNegocio('SOLICITANTE_OBLIGATORIO', 'Indica quien solicita la excepcion', undefined, 400);
      if (c.solicitadoPor === actorId) throw new ErrorNegocio('AUTORIZADOR_DISTINTO_DEL_SOLICITANTE', 'Quien solicita no puede ser quien autoriza');
      if (!(await q1(db, 'SELECT id FROM usuario WHERE id=? AND activo=1', [c.solicitadoPor]))) throw new ErrorNegocio('SOLICITANTE_INVALIDO', 'Solicitante no valido', undefined, 400);
    }
    const id = nuevoId();
    try {
      await ex(db,
        `INSERT INTO autorizacion_salida(id,viaje_id,parada_orden,manifiesto_version,tipo,solicitado_por,autorizado_por,motivo,conteo_continuan,vigente_key)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, c.viajeId, c.parada, ctx.version, c.tipo, c.solicitadoPor ?? null, actorId, c.motivo?.trim() ?? null, ctx.conteo, `${c.viajeId}:${c.parada}`]);
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') throw new ErrorNegocio('YA_AUTORIZADA', 'Ya existe una autorizacion vigente para esta parada');
      throw e;
    }
    await registrarEvento(db, { tipo: 'autorizacion_salida', resultado: c.tipo, viajeId: c.viajeId, parada: c.parada, actorId, payload: { version: ctx.version, motivo: c.motivo ?? null, solicitadoPor: c.solicitadoPor ?? null } });
    return { autorizacionId: id, esperadoABordo: r.esperadoABordo };
  });
}

export async function registrarSalidaReal(actorId: string, c: { viajeId: string; parada: number }) {
  const r = await tx(async db => {
    const viaje = await q1<any>(db, 'SELECT * FROM viaje WHERE id=? FOR UPDATE', [c.viajeId]);
    if (!viaje) throw new ErrorNegocio('VIAJE_NO_ENCONTRADO', 'Viaje no encontrado', undefined, 404);
    const a = await q1<any>(db, 'SELECT * FROM autorizacion_salida WHERE viaje_id=? AND parada_orden=? AND invalidada_at IS NULL', [c.viajeId, c.parada]);
    if (!a) throw new ErrorNegocio('SIN_AUTORIZACION_VIGENTE', 'No hay una autorizacion vigente para esta parada');
    if (a.salida_real_at) throw new ErrorNegocio('SALIDA_YA_REGISTRADA', 'La salida ya fue registrada');
    const vig = (await q1<any>(db, 'SELECT MAX(version) v FROM manifiesto WHERE viaje_id=? AND cerrado_at IS NOT NULL', [c.viajeId]))?.v;
    if (a.manifiesto_version !== vig) throw new ErrorNegocio('MANIFIESTO_CAMBIO', 'El manifiesto cambio despues de autorizar: hay que autorizar de nuevo');
    if (c.parada !== viaje.parada_actual) throw new ErrorNegocio('PARADA_NO_ACTUAL', `El bus esta en la parada ${viaje.parada_actual}`);
    const parada = await q1<any>(db, 'SELECT * FROM parada WHERE ruta_id=? AND orden=?', [viaje.ruta_id, c.parada]);

    // Bultos que suben aqui (para avisos) ANTES de cambiar su estado
    const suben = await q<any>(db,
      `SELECT b.id, b.encomienda_id FROM bulto b JOIN manifiesto_item mi ON mi.bulto_id=b.id JOIN manifiesto m ON m.id=mi.manifiesto_id
        WHERE m.viaje_id=? AND m.version=? AND mi.sube_orden=? AND b.estado='cargado'`, [c.viajeId, vig, c.parada]);
    // Solo pasan a en_transito los 'cargado' que SUBEN aqui; los que continuan no cambian.
    await ex(db,
      `UPDATE bulto b JOIN manifiesto_item mi ON mi.bulto_id=b.id JOIN manifiesto m ON m.id=mi.manifiesto_id
          SET b.estado='en_transito', b.version=b.version+1
        WHERE m.viaje_id=? AND m.version=? AND mi.sube_orden=? AND b.estado='cargado'`, [c.viajeId, vig, c.parada]);
    await ex(db,
      `UPDATE redespacho r JOIN manifiesto_item mi ON mi.bulto_id=r.bulto_id JOIN manifiesto m ON m.id=mi.manifiesto_id
          SET r.cerrado_at=NOW(3) WHERE m.viaje_id=? AND m.version=? AND mi.sube_orden=? AND r.cerrado_at IS NULL`, [c.viajeId, vig, c.parada]);
    await ex(db, 'UPDATE autorizacion_salida SET salida_real_at=NOW(3), salida_real_por=? WHERE id=?', [actorId, a.id]);

    // Verificar si esta era la última parada de la ruta
    const ultimaParada = await q1<any>(db, 'SELECT MAX(orden) max_orden FROM parada WHERE ruta_id=?', [viaje.ruta_id]);
    const maxOrden = Number(ultimaParada?.max_orden || c.parada);

    if (c.parada >= maxOrden) {
      // El bus completó la ruta en su destino final
      await ex(db, "UPDATE viaje SET estado='cerrado' WHERE id=?", [c.viajeId]);
    } else {
      // El bus avanza a la siguiente parada del trayecto
      await ex(db, "UPDATE viaje SET parada_actual=?, estado='en_ruta' WHERE id=?", [c.parada + 1, c.viajeId]);
    }

    for (const s of suben) await registrarEvento(db, { tipo: 'salida_real', bultoId: s.id, viajeId: c.viajeId, parada: c.parada, actorId });
    await registrarEvento(db, { tipo: 'salida_real', viajeId: c.viajeId, parada: c.parada, actorId, payload: { suben: suben.length } });

    // Avisos "en camino" por encomienda (cola desacoplada: si falla, la salida igual queda registrada)
    const encs = [...new Set(suben.map(s => s.encomienda_id))];
    for (const encId of encs) {
      const e = await q1<any>(db, 'SELECT e.*, ad.nombre destino FROM encomienda e JOIN agencia ad ON ad.id=e.destino_agencia_id WHERE e.id=?', [encId]);
      const desde = await q1<any>(db, 'SELECT nombre FROM agencia WHERE id=?', [parada.agencia_id]);
      const n = suben.filter(s => s.encomienda_id === encId).length;
      await encolar(db, { dedupeKey: `enc:${encId}:en_camino:${parada.agencia_id}:${e.dest_tel}`, encomiendaId: encId, tel: e.dest_tel, plantilla: 'en_camino',
        cuerpo: T.en_camino({ n, desde: desde?.nombre ?? parada.nombre, destino: e.destino }) });
    }
    return { ok: true, bultosEnTransito: suben.length };
  });
  despertarCola();
  return r;
}
