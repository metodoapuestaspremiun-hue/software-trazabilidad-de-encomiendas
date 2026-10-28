import { Db, tx, q, q1, ex, pj } from '../db';
import { ErrorNegocio, nuevoId, registrarEvento, param } from '../comun';
import { cotizar, type BultoMedidas } from '@/domain/tarifa';
import { nuevoQrToken, nuevoCodigoLegible } from '@/domain/codigos';
import { encolar, despertarCola } from '../mensajes/cola';
import { T } from '../mensajes/plantillas';

export interface BultoIn { pesoG: number; largoMm?: number | null; anchoMm?: number | null; altoMm?: number | null }
export interface EncomiendaIn {
  origenId: string; destinoId: string;
  remitenteNombre: string; remitenteTel?: string | null;
  destNombre: string; destTel?: string | null;
  contenido?: string | null; valorDeclaradoCent?: number | null; refExterna?: string | null;
  bultos: BultoIn[];
  viajeId?: string | null;
  /** Si no hay regla de tarifa: cotizacion manual con responsable y motivo. */
  manual?: { valorCent: number; motivo: string } | null;
}

export async function cotizarPara(db: Db, origenId: string, destinoId: string, bultos: BultoMedidas[]) {
  const tv = await q1<any>(db, 'SELECT * FROM tarifa_version WHERE vigente_desde<=CURDATE() ORDER BY vigente_desde DESC, creada_at DESC LIMIT 1');
  if (!tv) throw new ErrorNegocio('SIN_TARIFA', 'No hay una version de tarifa vigente');
  const reglas = (await q<any>(db, 'SELECT * FROM tarifa_regla WHERE tarifa_version_id=? AND origen_agencia_id=? AND destino_agencia_id=?',
    [tv.id, origenId, destinoId])).map(r => ({ id: r.id, desdeG: r.peso_fact_desde_g, hastaG: r.peso_fact_hasta_g, precioCent: r.precio_cent }));
  return { tarifaVersionId: tv.id as string, etiqueta: tv.etiqueta as string | null, resultado: cotizar(bultos, reglas, tv.factor_volumetrico) };
}

export async function crearEncomienda(actorId: string, i: EncomiendaIn) {
  if (i.origenId === i.destinoId) throw new ErrorNegocio('ORIGEN_IGUAL_DESTINO', 'Origen y destino son la misma agencia', undefined, 400);
  const r = await tx(async c => {
    const cot = await cotizarPara(c, i.origenId, i.destinoId, i.bultos);
    if (cot.resultado.sinRegla && !i.manual) {
      throw new ErrorNegocio('SIN_REGLA_TARIFA', 'No hay regla de tarifa para este peso/ruta. Se requiere cotizacion manual con motivo', cot.resultado.detalle);
    }
    if (cot.resultado.sinRegla && !i.manual?.motivo?.trim()) throw new ErrorNegocio('MOTIVO_OBLIGATORIO', 'La cotizacion manual exige motivo', undefined, 400);

    const encId = nuevoId();
    const codigo = 'E-' + nuevoCodigoLegible();
    await ex(c,
      `INSERT INTO encomienda(id,codigo,origen_agencia_id,destino_agencia_id,remitente_nombre,remitente_tel,dest_nombre,dest_tel,contenido_declarado,valor_declarado_cent,ref_externa,creado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [encId, codigo, i.origenId, i.destinoId, i.remitenteNombre, i.remitenteTel ?? null, i.destNombre, i.destTel ?? null,
       i.contenido ?? null, i.valorDeclaradoCent ?? null, i.refExterna ?? null, actorId]);

    const bultos: { id: string; numero: number; qrToken: string; codigoLegible: string; pesoG: number }[] = [];
    for (let n = 0; n < i.bultos.length; n++) {
      const b = i.bultos[n]; const id = nuevoId(); const qr = nuevoQrToken(); const leg = nuevoCodigoLegible();
      const tramoId = nuevoId();
      await ex(c,
        `INSERT INTO bulto(id,encomienda_id,numero,qr_token,codigo_legible,peso_g,largo_mm,ancho_mm,alto_mm,agencia_custodia_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, encId, n + 1, qr, leg, b.pesoG, b.largoMm ?? null, b.anchoMm ?? null, b.altoMm ?? null, i.origenId]);
      await ex(c, 'INSERT INTO bulto_tramo(id,bulto_id,orden,desde_agencia_id,hasta_agencia_id) VALUES (?,?,1,?,?)', [tramoId, id, i.origenId, i.destinoId]);
      await registrarEvento(c, { tipo: 'bulto_registrado', bultoId: id, actorId, payload: { encomienda: codigo, numero: n + 1 } });
      bultos.push({ id, numero: n + 1, qrToken: qr, codigoLegible: leg, pesoG: b.pesoG });

      // ASIGNACIÓN AUTOMÁTICA AL VIAJE SI FUE SELECCIONADO
      if (i.viajeId) {
        try {
          const v = await q1<any>(c, 'SELECT * FROM viaje WHERE id=?', [i.viajeId]);
          const m = await q1<any>(c, 'SELECT id, version, cerrado_at FROM manifiesto WHERE viaje_id=? ORDER BY version DESC LIMIT 1', [i.viajeId]);
          // Solo vincular automáticamente si el manifiesto está en borrador (NO cerrado) y el bus no está cerrado/en viaje
          if (v && m && !m.cerrado_at && ['planificado', 'programado'].includes(v.estado)) {
            const paradas = await q<any>(c, 'SELECT orden, agencia_id FROM parada WHERE ruta_id=? ORDER BY orden', [v.ruta_id]);
            const pSube = paradas.find(p => p.agencia_id === i.origenId);
            const pBaja = paradas.find(p => p.agencia_id === i.destinoId);
            if (pSube && pBaja && pSube.orden < pBaja.orden) {
              await ex(c,
                'INSERT INTO manifiesto_item(manifiesto_id,bulto_id,bulto_tramo_id,sube_orden,baja_orden) VALUES (?,?,?,?,?)',
                [m.id, id, tramoId, pSube.orden, pBaja.orden]
              );
              await registrarEvento(c, {
                tipo: 'agregado_a_manifiesto', bultoId: id, viajeId: i.viajeId, actorId,
                payload: { sube: pSube.orden, baja: pBaja.orden, version: m.version, auto: true }
              });
            }
          }
        } catch (errManifiesto) {
          console.warn('Advertencia asociando paquete a manifiesto automatico:', errManifiesto);
        }
      }
    }
    const valor = cot.resultado.sinRegla ? i.manual!.valorCent : cot.resultado.valorCent;
    await ex(c,
      `INSERT INTO cotizacion(id,encomienda_id,via,tarifa_version_id,peso_total_g,peso_fact_g,valor_cent,sin_regla,responsable_id,motivo,detalle)
       VALUES (?,?,'manual',?,?,?,?,?,?,?,?)`,
      [nuevoId(), encId, cot.tarifaVersionId, cot.resultado.pesoTotalG, cot.resultado.pesoFactTotalG, valor,
       cot.resultado.sinRegla ? 1 : 0, actorId, cot.resultado.sinRegla ? i.manual!.motivo : null, JSON.stringify(cot.resultado.detalle)]);

    const dest = await q1<any>(c, 'SELECT nombre FROM agencia WHERE id=?', [i.destinoId]);
    await encolar(c, {
      dedupeKey: `enc:${encId}:registro_confirmado:${i.destTel}`, encomiendaId: encId, tel: i.destTel, plantilla: 'registro_confirmado',
      cuerpo: T.registro_confirmado({ nombre: i.destNombre, remitente: i.remitenteNombre, n: bultos.length, destino: dest?.nombre ?? '' }),
    });
    return { id: encId, codigo, bultos, valorCent: valor, sinRegla: cot.resultado.sinRegla, etiquetaTarifa: cot.etiqueta };
  });
  despertarCola();
  return r;
}

export async function obtenerEncomienda(db: Db, id: string) {
  const e = await q1<any>(db,
    `SELECT e.*, ao.nombre origen_nombre, ad.nombre destino_nombre, v.estado AS estado_calculado
       FROM encomienda e JOIN agencia ao ON ao.id=e.origen_agencia_id JOIN agencia ad ON ad.id=e.destino_agencia_id
       LEFT JOIN v_encomienda_estado v ON v.id=e.id WHERE e.id=?`, [id]);
  if (!e) throw new ErrorNegocio('NO_ENCONTRADA', 'Encomienda no encontrada', undefined, 404);
  const bultos = await q<any>(db, 'SELECT id,numero,qr_token,codigo_legible,peso_g,estado FROM bulto WHERE encomienda_id=? ORDER BY numero', [id]);
  const cot = await q1<any>(db, 'SELECT valor_cent,sin_regla,motivo,detalle, (SELECT etiqueta FROM tarifa_version WHERE id=tarifa_version_id) etiqueta FROM cotizacion WHERE encomienda_id=? LIMIT 1', [id]);
  // Viaje asociado (via manifiesto del bulto más reciente)
  const viaje = await q1<any>(db,
    `SELECT vj.id, vj.vehiculo, vj.conductor, vj.estado AS viaje_estado, r.nombre AS ruta_nombre
       FROM bulto b
       JOIN manifiesto_item mi ON mi.bulto_id = b.id
       JOIN manifiesto m        ON m.id = mi.manifiesto_id
       JOIN viaje vj            ON vj.id = m.viaje_id
       LEFT JOIN ruta r         ON r.id = vj.ruta_id
      WHERE b.encomienda_id = ?
      ORDER BY m.version DESC LIMIT 1`, [id]);
  return { ...e, bultos, cotizacion: cot ? { ...cot, detalle: pj(cot.detalle) } : null, viaje: viaje ?? null };
}


export async function listarEncomiendas(db: Db, texto?: string) {
  const like = `%${(texto ?? '').trim()}%`;
  return q<any>(db,
    `SELECT e.id,e.codigo,e.dest_nombre,e.remitente_nombre,ao.nombre origen,ad.nombre destino,e.creado_at,v.estado,v.bultos
       FROM encomienda e JOIN agencia ao ON ao.id=e.origen_agencia_id JOIN agencia ad ON ad.id=e.destino_agencia_id
       LEFT JOIN v_encomienda_estado v ON v.id=e.id
      WHERE (? = '%%' OR e.codigo LIKE ? OR e.dest_nombre LIKE ? OR e.remitente_nombre LIKE ?)
      ORDER BY e.creado_at DESC LIMIT 100`, [like, like, like, like]);
}

/** Devuelve encomiendas agrupadas por viaje. Cada grupo incluye metadata del viaje y la lista de encomiendas. */
export async function listarEncomiendasPorViaje(db: Db, texto?: string) {
  const like = `%${(texto ?? '').trim()}%`;

  // Encomiendas con su viaje asociado (el viaje más reciente al que pertenecen sus bultos)
  const rows = await q<any>(db, `
    SELECT
      e.id,
      e.codigo,
      e.dest_nombre,
      e.remitente_nombre,
      ao.nombre           AS origen,
      ad.nombre           AS destino,
      e.creado_at,
      ves.estado,
      ves.bultos          AS bultos_count,
      vj.id               AS viaje_id,
      vj.vehiculo         AS viaje_vehiculo,
      vj.conductor        AS viaje_conductor,
      vj.estado           AS viaje_estado,
      r.nombre            AS ruta_nombre
    FROM encomienda e
    JOIN agencia ao   ON ao.id = e.origen_agencia_id
    JOIN agencia ad   ON ad.id = e.destino_agencia_id
    LEFT JOIN v_encomienda_estado ves ON ves.id = e.id
    LEFT JOIN (
      SELECT
        b.encomienda_id,
        m.viaje_id,
        ROW_NUMBER() OVER (PARTITION BY b.encomienda_id ORDER BY m.version DESC) rn
      FROM bulto b
      JOIN manifiesto_item mi ON mi.bulto_id = b.id
      JOIN manifiesto m        ON m.id = mi.manifiesto_id
    ) AS bv ON bv.encomienda_id = e.id AND bv.rn = 1
    LEFT JOIN viaje vj ON vj.id = bv.viaje_id
    LEFT JOIN ruta  r  ON r.id  = vj.ruta_id
    WHERE (? = '%%' OR e.codigo LIKE ? OR e.dest_nombre LIKE ? OR e.remitente_nombre LIKE ?)
    ORDER BY ISNULL(vj.id) ASC, vj.fecha DESC, e.creado_at DESC
    LIMIT 500
  `, [like, like, like, like]);

  // Construir mapa de grupos
  const gruposMap = new Map<string, {
    viaje_id: string | null;
    viaje_vehiculo: string | null;
    viaje_conductor: string | null;
    viaje_estado: string | null;
    ruta_nombre: string | null;
    encomiendas: any[];
    total_bultos: number;
  }>();

  for (const row of rows) {
    const key = row.viaje_id ?? '__sin_viaje__';
    if (!gruposMap.has(key)) {
      gruposMap.set(key, {
        viaje_id: row.viaje_id ?? null,
        viaje_vehiculo: row.viaje_vehiculo ?? null,
        viaje_conductor: row.viaje_conductor ?? null,
        viaje_estado: row.viaje_estado ?? null,
        ruta_nombre: row.ruta_nombre ?? null,
        encomiendas: [],
        total_bultos: 0,
      });
    }
    const g = gruposMap.get(key)!;
    g.encomiendas.push({
      id: row.id,
      codigo: row.codigo,
      dest_nombre: row.dest_nombre,
      remitente_nombre: row.remitente_nombre,
      origen: row.origen,
      destino: row.destino,
      creado_at: row.creado_at,
      estado: row.estado,
      bultos: row.bultos_count,
    });
    g.total_bultos += Number(row.bultos_count ?? 0);
  }

  return Array.from(gruposMap.values());
}

export async function catalogos(db: Db) {
  const agencias = await q<any>(db, 'SELECT id,nombre,ciudad FROM agencia WHERE activa=1 ORDER BY nombre');
  const rutas = await q<any>(db, 'SELECT id,nombre FROM ruta ORDER BY nombre');
  const paradas = await q<any>(db, 'SELECT id,ruta_id,orden,nombre,agencia_id FROM parada ORDER BY ruta_id,orden');
  const tv = await q1<any>(db, 'SELECT etiqueta FROM tarifa_version ORDER BY vigente_desde DESC LIMIT 1');
  // Viajes activos en andén disponibles para cargar encomiendas (no cerrados ni en viaje terminado)
  const viajes = await q<any>(db,
    `SELECT v.id, v.vehiculo, v.conductor, v.estado, v.parada_actual, v.ruta_id, r.nombre as ruta_nombre
       FROM viaje v
       JOIN ruta r ON r.id = v.ruta_id
      WHERE v.estado IN ('planificado', 'programado')
        AND (
          EXISTS (
            SELECT 1 FROM manifiesto m 
             WHERE m.viaje_id = v.id 
               AND m.cerrado_at IS NULL
          )
          OR NOT EXISTS (
            SELECT 1 FROM manifiesto m WHERE m.viaje_id = v.id
          )
        )
      ORDER BY v.fecha DESC, v.vehiculo ASC`
  );
  return {
    agencias,
    rutas: rutas.map(r => ({ ...r, paradas: paradas.filter(p => p.ruta_id === r.id) })),
    viajes,
    etiquetaTarifa: tv?.etiqueta ?? null
  };
}
void param;
