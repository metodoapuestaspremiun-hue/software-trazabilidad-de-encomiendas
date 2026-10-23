'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { llamar, fmtLegible } from '@/lib/cliente';
import { Error_, Estado, BotonAtras } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Viaje() {
  const { id } = useParams<{ id: string }>();
  const u = useUsuario();
  const gestiona = puede(u, 'manifiesto:gestionar');

  const [v, setV]                             = useState<any>(null);
  const [err, setErr]                         = useState<any>(null);
  const [ok, setOk]                           = useState('');
  const [motivo, setMotivo]                   = useState('');

  // Tripulación
  const [tripulantes, setTripulantes] = useState<any[]>([]);
  const [condId,  setCondId]  = useState('');
  const [condNom, setCondNom] = useState('');
  const [ayuId,   setAyuId]   = useState('');
  const [ayuNom,  setAyuNom]  = useState('');

  const cargar = () => llamar('/api/viajes/' + id).then(setV).catch(setErr);

  useEffect(() => { cargar(); }, [id]);

  useEffect(() => {
    if (gestiona) llamar('/api/tripulantes').then(setTripulantes).catch(() => {});
  }, [v]);

  const act = async (fn: () => Promise<any>, msg: string) => {
    setErr(null); setOk('');
    try { await fn(); setOk(msg); await cargar(); } catch (e) { setErr(e); }
  };

  const [tabDetalle, setTabDetalle]           = useState<'manifiesto' | 'trazabilidad'>('manifiesto');

  if (!v) return <div><Error_ e={err} />Cargando...</div>;

  const nombreP    = (o: number) => v.paradas?.find((p: any) => p.orden === o)?.nombre ?? o;
  const rolBulto   = (it: any, p: number) =>
    it.baja_orden === p ? 'baja' : it.sube_orden === p ? 'sube' :
    (it.sube_orden < p && it.baja_orden > p) ? 'continua' : '';

  const estadoColor    = v.estado === 'en_ruta' ? 'verde' : v.estado === 'cerrado' ? '' : 'amarillo';
  const conductorLabel = v.conductorUsr?.nombre || v.conductor || '—';
  const ayudanteLabel  = v.ayudanteUsr?.nombre  || v.ayudante  || '—';

  const cerrarConTripulacion = () => act(async () => {
    const payload: any = {};
    if (condId)          payload.conductorId     = condId;
    else if (condNom)    payload.conductorNombre  = condNom;
    if (ayuId)           payload.ayudanteId       = ayuId;
    else if (ayuNom)     payload.ayudanteNombre   = ayuNom;
    await llamar(`/api/viajes/${id}/manifiesto/cerrar`, 'POST', payload);
  }, '✓ Manifiesto cerrado — tripulación asignada como responsable');

  return (
    <div>
      <BotonAtras href="/viajes" label="Volver a Viajes" />
      <h1>Viaje {v.vehiculo} · {v.ruta}</h1>
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}

      {/* ── INFO GENERAL DEL VIAJE ── */}
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span>Estado: <span className={`tag ${estadoColor}`}>{v.estado}</span></span>
          <span>Parada actual: <b>{nombreP(v.parada_actual)}</b></span>
          <span>Manifiesto v{v.version}{' '}
            {v.borrador
              ? <span className="tag amarillo">BORRADOR — pendiente cerrar</span>
              : <span className="tag verde">✓ CERRADO</span>}
          </span>
        </div>

        {/* Tripulación asignada — visible cuando el manifiesto ya está cerrado */}
        {!v.borrador && v.version && (
          <div className="tripulacion-badge-row">
            <div className="tripulacion-badge">
              <span className="tripulacion-icono">🚌</span>
              <div>
                <div className="tripulacion-rol">Chofer</div>
                <div className="tripulacion-nombre">{conductorLabel}</div>
              </div>
            </div>
            <div className="tripulacion-badge">
              <span className="tripulacion-icono">👤</span>
              <div>
                <div className="tripulacion-rol">Ayudante</div>
                <div className="tripulacion-nombre">{ayudanteLabel}</div>
              </div>
            </div>
          </div>
        )}

        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <b>Operar parada en ruta:</b>{' '}
          {v.paradas.map((p: any) => (
            <Link key={p.orden} className="btn sec" style={{ marginRight: 6, marginTop: 4 }}
              href={`/viajes/${id}/paradas/${p.orden}`}>
              {p.orden}. {p.nombre}
            </Link>
          ))}
        </p>
      </div>

      {/* SELECTOR DE PESTAÑAS: MANIFIESTO vs TRAZABILIDAD Y ESCANEOS */}
      <div className="dash-tabs-bar noprint" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`dash-tab-btn ${tabDetalle === 'manifiesto' ? 'activo' : ''}`}
          onClick={() => setTabDetalle('manifiesto')}
        >
          <span>📦 Manifiesto de Carga</span>
          <span className="dash-tab-count">{v.items?.length || 0}</span>
        </button>
        <button
          type="button"
          className={`dash-tab-btn ${tabDetalle === 'trazabilidad' ? 'activo' : ''}`}
          onClick={() => setTabDetalle('trazabilidad')}
        >
          <span>🔍 Trazabilidad y Escaneos por Parada</span>
          <span className="dash-tab-count">{v.escaneos?.length || 0}</span>
        </button>
      </div>

      {/* ── SECCIÓN 1: MANIFIESTO DE CARGA ── */}
      {tabDetalle === 'manifiesto' && (
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Manifiesto · versión {v.version}</h2>
          {!v.borrador ? (
            <span className="tag verde" style={{ fontSize: 13, padding: '6px 12px', fontWeight: 700 }}>
              🔒 Manifiesto Cerrado · {v.estado === 'en_ruta' ? 'Bus en viaje' : 'Carga formalizada'}
            </span>
          ) : (
            <span className="tag amarillo" style={{ fontSize: 13, padding: '6px 12px', fontWeight: 700 }}>
              📝 Modo Borrador · Abierto a cambios
            </span>
          )}
        </div>

        {!v.borrador && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.08), rgba(16, 185, 129, 0.08))',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 24 }}>🚌</span>
            <div style={{ fontSize: 13, color: '#1e293b' }}>
              <b>Manifiesto cerrado y bloqueado:</b> Este bus ya despachó su carga. 
              {v.estado === 'en_ruta' && ' La unidad se encuentra actualmente en viaje. '}
              No se permite agregar nuevos paquetes ni alterar el manifiesto directamente.
            </div>
          </div>
        )}

        <div className="tabla-scroll">
          <table className="tabla-fija">
            <thead>
              <tr>
                <th>Paquete</th><th>Encomienda</th><th>Destinatario</th>
                <th>Sube</th><th>Baja</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {v.items.map((it: any) => (
                <tr key={it.bulto_id}>
                  <td className="mono">{fmtLegible(it.codigo_legible)}</td>
                  <td>{it.enc_codigo} #{it.numero}</td>
                  <td>{it.dest_nombre}</td>
                  <td>{nombreP(it.sube_orden)}</td>
                  <td>{nombreP(it.baja_orden)}</td>
                  <td><Estado e={it.estado} /></td>
                  <td>
                    {gestiona && v.borrador && (
                      <button className="sec" onClick={() =>
                        act(() => llamar(`/api/viajes/${id}/manifiesto/items?bultoId=${it.bulto_id}`, 'DELETE'),
                          'Paquete quitado')}>Quitar</button>
                    )}
                  </td>
                </tr>
              ))}
              {!v.items.length && (
                <tr><td colSpan={7} className="muted">Sin paquetes en el manifiesto</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Resumen por parada */}
        <p className="muted" style={{ marginTop: 8 }}>
          {v.paradas.map((p: any) =>
            `${p.nombre}: ↑${v.items.filter((i: any) => rolBulto(i, p.orden) === 'sube').length} sube · ` +
            `↓${v.items.filter((i: any) => rolBulto(i, p.orden) === 'baja').length} baja · ` +
            `→${v.items.filter((i: any) => rolBulto(i, p.orden) === 'continua').length} continúa`
          ).join('   |   ')}
        </p>

        {/* ── TRIPULACIÓN — solo en modo borrador con paquetes cargados ── */}
        {gestiona && v.borrador && v.items.length > 0 && (
          <div className="tripulacion-box">
            <div className="tripulacion-box-header">
              <span className="tripulacion-box-icon">🚌</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Tripulación — Requerida para cerrar el manifiesto
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
                  Al cerrar, el chofer y ayudante quedan formalmente como los responsables de los paquetes hasta la entrega.
                </p>
              </div>
            </div>

            <div className="tripulacion-campos">
              {/* CHOFER (con nombres de prueba / demo) */}
              <div className="tripulacion-campo-grupo">
                <label className="tripulacion-label" style={{ color: '#1e3a8a', fontWeight: 700 }}>
                  Chofer <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={condNom}
                  onChange={e => { setCondNom(e.target.value); setCondId(''); }}
                  className="tripulacion-select"
                >
                  <option value="">— Seleccionar chofer —</option>
                  <option value="Carlos Andrade (Chofer Demo)">Carlos Andrade (Chofer Demo)</option>
                  <option value="Manuel Guarnizo (Chofer Demo)">Manuel Guarnizo (Chofer Demo)</option>
                  <option value="Luis Torres (Chofer Demo)">Luis Torres (Chofer Demo)</option>
                  <option value="Segundo Cueva (Chofer Demo)">Segundo Cueva (Chofer Demo)</option>
                  {tripulantes.map(t => (
                    <option key={t.id} value={t.nombre}>{t.nombre}</option>
                  ))}
                </select>
                <input
                  style={{ marginTop: 6 }}
                  className="tripulacion-input"
                  value={condNom}
                  onChange={e => { setCondNom(e.target.value); setCondId(''); }}
                  placeholder="O escribe/edita el nombre del chofer"
                />
              </div>

              {/* AYUDANTE (opcional y para escribir el nombre directamente) */}
              <div className="tripulacion-campo-grupo">
                <label className="tripulacion-label" style={{ color: '#1e3a8a', fontWeight: 700 }}>
                  Ayudante <span style={{ fontWeight: 400, color: '#64748b', textTransform: 'none' }}>(opcional)</span>
                </label>
                <input
                  className="tripulacion-input"
                  value={ayuNom}
                  onChange={e => { setAyuNom(e.target.value); setAyuId(''); }}
                  placeholder="Escribe el nombre del ayudante (opcional)"
                />
                <span className="muted" style={{ fontSize: '11.5px', marginTop: 4 }}>
                  Ingresa manualmente el nombre del ayudante asignado si lo hubiere.
                </span>
              </div>
            </div>

            <button
              className="verde"
              style={{ marginTop: 16, width: '100%', fontSize: 15, padding: '12px' }}
              onClick={cerrarConTripulacion}
              disabled={!condId && !condNom.trim()}
            >
              Cerrar manifiesto y asignar tripulación
            </button>
            {!condId && !condNom.trim() && (
              <p style={{ marginTop: 8, fontSize: 13, textAlign: 'center', color: '#64748b', fontWeight: 500 }}>
                ⚠️ Selecciona o escribe el nombre del chofer para poder cerrar el manifiesto
              </p>
            )}
          </div>
        )}

        {/* Sin paquetes aún — botón cerrar deshabilitado */}
        {gestiona && v.borrador && v.items.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Agrega al menos un paquete al manifiesto antes de cerrar.
          </p>
        )}

        {/* ── REABRIR manifiesto después del cierre ── */}
        {gestiona && !v.borrador && v.version && (
          <div className="row" style={{ marginTop: 16 }}>
            <label>Motivo del cambio <span className="muted" style={{ fontSize: 12 }}>(obligatorio — invalida la autorización vigente)</span>
              <input value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: paquete olvidado en bodega" />
            </label>
            <button className="rojo"
              onClick={() => act(
                () => llamar(`/api/viajes/${id}/manifiesto/modificar`, 'POST', { motivo }),
                'Nueva versión abierta — la autorización vigente quedó invalidada'
              )}
              disabled={!motivo.trim()}
            >Reabrir manifiesto</button>
          </div>
        )}
      </div>
      )}

      {/* ── SECCIÓN 2: TRAZABILIDAD Y REGISTRO DE ESCANEOS POR ZONA/PARADA ── */}
      {tabDetalle === 'trazabilidad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {v.paradas.map((p: any) => {
            const escaneosParada = (v.escaneos || []).filter((s: any) => s.parada_orden === p.orden);
            const subidas = escaneosParada.filter((s: any) => s.tipo === 'escaneo_carga');
            const bajadas = escaneosParada.filter((s: any) => s.tipo === 'escaneo_descarga');
            const esParadaActual = v.parada_actual === p.orden;

            return (
              <div key={p.orden} className="card" style={{ borderLeft: esParadaActual ? '4px solid #2563eb' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>📍 Parada #{p.orden}: {p.nombre}</span>
                      {esParadaActual && <span className="tag verde">En este punto</span>}
                    </h2>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                      Registro de paquetes cargados (subidos) y descargados (bajados) en esta zona.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="tag verde">↑ {subidas.length} subidos</span>
                    <span className="tag">↓ {bajadas.length} bajados</span>
                    <Link href={`/viajes/${id}/paradas/${p.orden}`} className="btn sec" style={{ padding: '4px 10px', fontSize: '12px' }}>
                      Escanear en esta parada ➔
                    </Link>
                  </div>
                </div>

                {escaneosParada.length > 0 ? (
                  <div className="tabla-scroll">
                    <table className="tabla-fija">
                      <thead>
                        <tr>
                          <th>Operación</th>
                          <th>Código QR / Paquete</th>
                          <th>Encomienda</th>
                          <th>Destinatario</th>
                          <th>Fecha y Hora</th>
                          <th>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {escaneosParada.map((s: any) => (
                          <tr key={s.id}>
                            <td>
                              <span className={`tag ${s.tipo === 'escaneo_carga' ? 'verde' : 'amarillo'}`}>
                                {s.tipo === 'escaneo_carga' ? '↑ SUBIDO (Carga)' : '↓ BAJADO (Descarga)'}
                              </span>
                            </td>
                            <td className="mono" style={{ fontWeight: 700, fontSize: '14.5px' }}>
                              <Link href={`/bultos/${s.codigo_legible}`} style={{ color: '#1e40af' }}>
                                {fmtLegible(s.codigo_legible)}
                              </Link>
                            </td>
                            <td>{s.enc_codigo} #{s.numero}</td>
                            <td>{s.dest_nombre}</td>
                            <td style={{ fontSize: '12.5px', color: '#64748b' }}>
                              {new Date(s.recibido_servidor).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td>
                              <span className={`tag ${s.resultado === 'ok' ? 'verde' : 'rojo'}`}>
                                {s.resultado === 'ok' ? '✓ Verificado' : s.resultado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: '8px 0 0', textAlign: 'center', padding: '16px' }}>
                    Sin registros de escaneo en {p.nombre} todavía.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
