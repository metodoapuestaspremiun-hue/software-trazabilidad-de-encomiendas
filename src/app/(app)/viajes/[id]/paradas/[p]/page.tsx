'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { llamar, nuevoEventId, fmtLegible, fechaEC } from '@/lib/cliente';
import { Error_, Estado, ResultadoGrande, Scanner } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

export default function Parada() {
  const { id, p } = useParams<{ id: string; p: string }>();
  const searchParams = useSearchParams();
  const u = useUsuario();
  const orden = Number(p);

  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [ok, setOk] = useState('');
  const modoInicial = (searchParams.get('modo') === 'descarga') ? 'descarga' : 'carga';
  const [modo, setModo] = useState<'carga' | 'descarga'>(modoInicial);
  const [res, setRes] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [conteo, setConteo] = useState(''); const [usuarios, setUsuarios] = useState<any[]>([]);
  const [exc, setExc] = useState({ motivo: '', solicitadoPor: '' }); const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => llamar(`/api/viajes/${id}/paradas/${p}`).then(setD).catch(setErr), [id, p]);
  useEffect(() => { cargar(); llamar('/api/usuarios').then(setUsuarios).catch(() => {}); }, [cargar]);
  const act = async (fn: () => Promise<any>, msg: string) => { setErr(null); setOk(''); try { await fn(); setOk(msg); } catch (e) { setErr(e); } await cargar(); };
  const escanear = async (codigo: string) => {
    setErr(null); setOcupado(true);
    try {
      const r: any = await llamar('/api/escaneos', 'POST', { eventId: nuevoEventId(), tipo: modo, viajeId: id, parada: orden, codigo, deviceId: navigator.userAgent.slice(0, 60) });
      setRes(r); setHist(h => [{ ...r, modo, t: new Date() }, ...h].slice(0, 12));
      if (typeof navigator.vibrate === 'function') navigator.vibrate(r.resultado === 'ok' ? 80 : [200, 80, 200]);
    } catch (e) { setErr(e); setRes(null); } finally { setOcupado(false); await cargar(); }
  };
  if (err && (err.codigo === 'SIN_MANIFIESTO' || (typeof err === 'string' && err.includes('SIN_MANIFIESTO')))) {
    return (
      <div>
        <h1>Parada {orden}</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <h2 style={{ margin: '0 0 8px' }}>El manifiesto aún no está cerrado</h2>
          <p className="muted">El Operador de Ventanilla debe cerrar el manifiesto antes de que puedas operar esta parada.</p>
          <p className="muted">Una vez cerrado, aquí verás los paquetes que suben, bajan y continúan en el bus.</p>
          <Link href={'/viajes/' + id} className="btn sec" style={{ marginTop: 12, display: 'inline-block' }}>← Volver al viaje</Link>
        </div>
      </div>
    );
  }
  if (!d) return <div><Error_ e={err} />Cargando...</div>;
  const ev = d.evaluacion; const aut = d.autorizacion;
  const lista = (rol: string) => d.bultos.filter((b: any) => b.rol === rol);
  const Col = ({ titulo, rol }: { titulo: string; rol: string }) => (
    <div className="card">
      <h2>{titulo} ({lista(rol).length})</h2>
      <table>
        <tbody>
          {lista(rol).map((b: any) => {
            const esPendienteCarga = rol === 'sube' && b.estado !== 'cargado';
            const tieneFaltante = d.incidencias?.some((inc: any) => inc.tipo === 'faltante' && inc.codigo_legible === b.codigo);
            return (
              <tr key={b.bultoId}>
                <td className="mono">{fmtLegible(b.codigo)}</td>
                <td>{b.encomienda} #{b.numero}</td>
                <td><Estado e={b.estado} /></td>
                {enParada && (
                  <td style={{ textAlign: 'right' }}>
                    {esPendienteCarga && !tieneFaltante && puede(u, 'escaneo:operar') && (
                      <button
                        className="sec"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        title="Reportar si no se encuentra el paquete físicamente"
                        onClick={() => {
                          const razon = prompt(`Indica el motivo/razón de por qué no se encuentra el paquete ${fmtLegible(b.codigo)}:`);
                          if (!razon || !razon.trim()) return;
                          act(
                            () => llamar('/api/incidencias', 'POST', {
                              tipo: 'faltante',
                              codigo: b.codigo,
                              viajeId: id,
                              nota: razon.trim(),
                            }),
                            'Faltante registrado con razón'
                          );
                        }}
                      >
                        ⚠️ No encontrado
                      </button>
                    )}
                    {tieneFaltante && (
                      <span className="tag rojo" style={{ fontSize: 11 }}>Faltante reportado</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const enParada = d.viaje.parada_actual === orden;
  const continuan = lista('continua').length;
  return (
    <div>
      <h1>📍 Parada {orden}: {d.parada.nombre} <span className="muted">· manifiesto v{d.version} · <Link href={'/viajes/' + id}>← volver al viaje</Link></span></h1>
      {!enParada && (
        <div className={orden < d.viaje.parada_actual ? 'err' : 'card'} style={orden >= d.viaje.parada_actual ? { background: '#1e3a5f', border: '1px solid #2563eb' } : {}}>
          {orden < d.viaje.parada_actual
            ? `⚠️ Esta parada ya salió. El bus está ahora en la parada ${d.viaje.parada_actual}.`
            : `⏳ El bus aún no llegó aquí. Está en la parada ${d.viaje.parada_actual}. Cuando llegue podrás escanear paquetes.`}
        </div>
      )}
      <Error_ e={err} />{ok && <div className="okmsg">{ok}</div>}

      {/* ── 1. PRIMER ELEMENTO (ARRIBA DEL TODO): AUTORIZACIÓN DE PARTIDA Y SALIDA DEL BUS ── */}
      <div id="salida" className="card" style={{ borderLeft: '5px solid #10b981', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
            <span>🚀 Autorización de Partida y Salida del Bus</span>
          </h2>
          {aut && (
            <span className="tag verde" style={{ fontWeight: 700 }}>
              ✓ Salida autorizada ({aut.tipo})
            </span>
          )}
        </div>

        {ev.normalPermitida ? (
          <div className="okmsg" style={{ margin: '8px 0 12px' }}>
            ✓ <b>La carga concilia con el manifiesto.</b> Se esperan {ev.esperadoABordo} paquete(s) a bordo al partir.
          </div>
        ) : (
          <div className="err" style={{ margin: '8px 0 12px' }}>
            <b style={{ fontSize: 14 }}>Salida bloqueada</b>
            {ev.mensajes.map((m: string, i: number) => (
              <div key={i} style={{ marginTop: 3 }}>• {m}</div>
            ))}
          </div>
        )}

        {aut ? (
          <p style={{ margin: '6px 0 12px', fontSize: 13 }}>
            Autorización vigente ({aut.tipo}) {fechaEC(aut.autorizado_at)}{' '}
            {aut.salida_real_at ? <b>· SALIDA OFICIAL REGISTRADA {fechaEC(aut.salida_real_at)}</b> : ''}
          </p>
        ) : (
          <p className="muted" style={{ margin: '6px 0 12px', fontSize: 13 }}>Sin autorización vigente de salida.</p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {enParada && !aut && puede(u, 'salida:autorizar') && (
            <button
              className="verde"
              style={{
                padding: '12px 22px', fontSize: 15, fontWeight: 800,
                boxShadow: ev.normalPermitida ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
              }}
              disabled={!ev.normalPermitida}
              onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'normal' }), 'Salida autorizada')}
            >
              ✓ Autorizar partida del bus
            </button>
          )}

          {enParada && aut && !aut.salida_real_at && puede(u, 'salida:registrar_real') && (
            <button
              onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/salida-real`, 'POST'), 'Salida real registrada: el bus partió')}
              style={{ padding: '12px 22px', fontSize: 15, fontWeight: 800, background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8 }}
            >
              🚀 Registrar partida real del bus
            </button>
          )}
        </div>

        {enParada && !aut && !ev.normalPermitida && ev.excepcionPermitida === 'A' && puede(u, 'excepcion:autorizar') && (
          <div className="card" style={{ marginTop: 14, background: '#fff1f2', border: '1px solid #fecdd3' }}>
            <h2 style={{ fontSize: 14, color: '#9f1239', margin: '0 0 8px' }}>Excepción A (Supervisor)</h2>
            <div className="row">
              <label style={{ fontSize: 13 }}>
                Motivo (obligatorio)
                <input value={exc.motivo} onChange={e => setExc({ ...exc, motivo: e.target.value })} placeholder="Ej: paquete retrasado en bodega" />
              </label>
              <label style={{ fontSize: 13 }}>
                Quién solicita la excepción
                <select value={exc.solicitadoPor} onChange={e => setExc({ ...exc, solicitadoPor: e.target.value })}>
                  <option value="">-- elegir personal --</option>
                  {usuarios.filter(x => x.id !== u.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
              <button
                className="rojo"
                disabled={!exc.motivo.trim() || !exc.solicitadoPor}
                onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/autorizar`, 'POST', { tipo: 'excepcion_a', ...exc }), 'Excepción autorizada')}
              >
                Autorizar con excepción
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. SEGUNDO ELEMENTO (EN EL MEDIO): OPERACIÓN DE PAQUETES CON 2 BOTONES VISIBLES ── */}
      {puede(u, 'escaneo:operar') && enParada && (
        <div id="escaneo" className="card" style={{ borderLeft: '5px solid #2563eb', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.10)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#1e3a8a' }}>
                📷 {modo === 'carga' ? 'Subir Paquetes al Bus (Carga)' : 'Bajar Paquetes del Bus (Descarga)'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>
                Selecciona la acción y luego escanea cada bulto (o digita su código) para registrarlo de inmediato.
              </p>
            </div>
          </div>

          {/* Selector de operación con 2 BOTONES EN LA MISMA FILA (modo móvil y escritorio) */}
          <div style={{ margin: '12px 0 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
              Selecciona la operación que vas a realizar:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setModo('carga')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '12px 8px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  border: modo === 'carga' ? '2.5px solid #2563eb' : '1.5px solid #cbd5e1',
                  background: modo === 'carga' ? '#eff6ff' : '#ffffff',
                  color: modo === 'carga' ? '#1d4ed8' : '#475569',
                  boxShadow: modo === 'carga' ? '0 4px 12px rgba(37, 99, 235, 0.20)' : 'none',
                  transition: 'all 0.15s ease',
                  minWidth: 0,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 20 }}>⬆️</span>
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Subir Paquetes</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: modo === 'carga' ? '#2563eb' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Cargar ({lista('sube').length})
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setModo('descarga')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '12px 8px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  border: modo === 'descarga' ? '2.5px solid #d97706' : '1.5px solid #cbd5e1',
                  background: modo === 'descarga' ? '#fffbeb' : '#ffffff',
                  color: modo === 'descarga' ? '#b45309' : '#475569',
                  boxShadow: modo === 'descarga' ? '0 4px 12px rgba(217, 119, 6, 0.20)' : 'none',
                  transition: 'all 0.15s ease',
                  minWidth: 0,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 20 }}>⬇️</span>
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Bajar Paquetes</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: modo === 'descarga' ? '#d97706' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Descargar ({lista('baja').length})
                  </div>
                </div>
              </button>
            </div>
          </div>

          <Scanner onCode={escanear} ocupado={ocupado} />
          <ResultadoGrande r={res} />

          {hist.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                Últimos escaneos realizados en esta sesión:
              </div>
              <div className="tabla-scroll">
                <table>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 700 }}>{fmtLegible(h.codigo ?? '')}</td>
                        <td><b>{h.modo === 'carga' ? '⬆️ Subido (Cargado)' : '⬇️ Bajado (Descargado)'}</b></td>
                        <td>
                          <span className={`tag ${h.resultado === 'ok' ? 'verde' : 'rojo'}`}>
                            {h.resultado === 'ok' ? '✓ Correcto' : h.resultado}
                          </span>
                        </td>
                        <td className="muted">{h.alerta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. TERCER ELEMENTO: RESUMEN DE PAQUETES (BAJAN, SUBEN, CONTINÚAN) ── */}
      <div className="grid">
        <Col titulo="⬇️ Bajan aquí" rol="baja" />
        <Col titulo="⬆️ Suben aquí" rol="sube" />
        <Col titulo="➡️ Continúan a bordo" rol="continua" />
      </div>

      {puede(u, 'conteo:continuan') && continuan > 0 && enParada && (
        <div className="card">
          <h2>Conteo de los que continúan a bordo</h2>
          <p className="muted">
            Cuenta visualmente los paquetes que siguen en el bus (el sistema espera {continuan}). Conteo registrado: <b>{d.conteo ?? 'ninguno'}</b>
          </p>
          <div className="row">
            <label>
              Cantidad contada
              <input type="number" min={0} value={conteo} onChange={e => setConteo(e.target.value)} />
            </label>
            <button
              onClick={() => act(() => llamar(`/api/viajes/${id}/paradas/${p}/conteo`, 'POST', { conteo: parseInt(conteo || '0') }), 'Conteo registrado')}
              disabled={conteo === ''}
            >
              Registrar conteo
            </button>
          </div>
        </div>
      )}

      {/* ── 4. CUARTO ELEMENTO (ÚLTIMO): INCIDENCIAS ABIERTAS DEL VIAJE ── */}
      <div className="card">
        <h2>Incidencias abiertas del viaje ({d.incidencias.length})</h2>
        <table>
          <tbody>
            {d.incidencias.map((i: any) => (
              <tr key={i.id}>
                <td><span className="tag rojo">{i.tipo}</span></td>
                <td className="mono">{fmtLegible(i.codigo_legible ?? '')}</td>
                <td>{fechaEC(i.abierta_at)}</td>
                <td>
                  {puede(u, 'incidencia:resolver') && (
                    <button
                      className="sec"
                      onClick={() => {
                        const nota = prompt('Nota de resolución (qué se hizo):') ?? '';
                        act(() => llamar(`/api/incidencias/${i.id}/resolver`, 'POST', { nota }), 'Incidencia resuelta');
                      }}
                    >
                      Resolver
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!d.incidencias.length && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '16px' }}>
                  Sin incidencias reportadas en este viaje.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 8 }}>
          Las incidencias de tipo sobrante / descarga incorrecta sin resolver bloquean la salida (no se pueden saltar con excepción).
        </p>
      </div>
    </div>
  );
}
