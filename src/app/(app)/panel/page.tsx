'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { llamar, fechaEC } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';
import { NuevaEncomiendaModal } from '@/components/NuevaEncomiendaModal';
import OperacionViajeModal from '@/components/OperacionViajeModal';

export default function Panel() {
  const u = useUsuario();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [catalogo, setCatalogo] = useState<any>(null);
  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false);
  const [modalViajeConfig, setModalViajeConfig] = useState<{
    abierto: boolean;
    viajeId: string;
    parada: number;
    modo: 'carga' | 'descarga' | 'salida';
  }>({
    abierto: false,
    viajeId: '',
    parada: 1,
    modo: 'carga',
  });
  const [err, setErr] = useState<any>(null);
  const [cod, setCod] = useState('');
  const [tabActiva, setTabActiva] = useState<string>('todos');

  const cargar = () => llamar('/api/panel').then(setD).catch(setErr);
  useEffect(() => {
    cargar();
    llamar('/api/catalogos').then(setCatalogo).catch(console.warn);
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  const buscar = async () => {
    setErr(null);
    try {
      const b: any = await llamar('/api/bultos?codigo=' + encodeURIComponent(cod));
      router.push('/bultos/' + b.id);
    } catch (e) {
      setErr(e);
    }
  };

  if (!d) return <div>{err ? <Error_ e={err} /> : 'Cargando...'}</div>;
  const sup = puede(u, 'incidencia:resolver') || puede(u, 'ver:todo');

  // Determinar tabs según permisos (sin emojis, estilo ejecutivo)
  const tabs = [
    { id: 'todos', label: 'Resumen General', count: null },
    ...(puede(u, 'encomienda:crear')
      ? [
          { id: 'porRecibir', label: 'Por Recibir', count: d.porRecibir.length },
          { id: 'disponibles', label: 'Listos para Retiro', count: d.disponibles.length },
        ]
      : []),
    { id: 'viajes', label: 'Viajes en Ruta', count: d.viajes.length },
    ...((puede(u, 'encomienda:crear') || puede(u, 'ver:todo'))
      ? [{ id: 'redespachos', label: 'Redespachos', count: d.redespachos.length }]
      : []),
    { id: 'incidencias', label: 'Incidencias', count: d.incidencias.length },
    ...(sup ? [{ id: 'auditoria', label: 'Auditoría', count: (d.excepciones?.length || 0) + (d.modificaciones?.length || 0) }] : []),
  ];

  return (
    <div style={{ width: '100%', maxWidth: '100%', margin: '0' }}>
      {/* CABECERA SUPERIOR: TÍTULO Y BÚSQUEDA RÁPIDA */}
      <div className="dash-header-wrap">
        <div className="dash-title-row" style={{ alignItems: 'center' }}>
          <div>
            <h1>
              <span>
                {puede(u, 'encomienda:crear') ? 'Panel Operativo de Ventanilla' :
                 (puede(u, 'salida:autorizar') && puede(u, 'escaneo:operar')) ? 'Panel de Conductor / Tripulación de Bus' :
                 puede(u, 'salida:autorizar') ? 'Panel de Conductor y Salidas' :
                 puede(u, 'escaneo:operar') ? 'Panel de Tripulación y Escaneo' :
                 'Panel Operativo General'}
              </span>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {puede(u, 'encomienda:crear') && (
              <button
                type="button"
                onClick={() => setModalNuevaAbierto(true)}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'transform 0.15s ease',
                }}
              >
                <span style={{ fontSize: 18 }}>+</span>
                <span>Registrar Nueva Encomienda</span>
              </button>
            )}

            <div className="dash-search-box noprint">
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>BUSCAR:</span>
              <input
                value={cod}
                onChange={e => setCod(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="Código (XXXX-XXXX) o QR..."
              />
              <button
                type="button"
                onClick={buscar}
                style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '10px' }}
              >
                Rastrear
              </button>
            </div>
          </div>
        </div>
      </div>

      <Error_ e={err} />

      {/* SECCIÓN TRIPULACIÓN: VIAJES LISTOS CON MANIFIESTO CERRADO (EXCLUSIVO TRIPULACIÓN/CONDUCTOR) */}
      {(() => {
        // Solo para Conductor / Tripulación de Bus (no para operador de ventanilla)
        const esTripulacion = !puede(u, 'encomienda:crear') && (puede(u, 'salida:autorizar') || puede(u, 'escaneo:operar'));
        if (!esTripulacion) return null;

        // Solo viajes que tengan bultos activos pendientes de entrega (items > 0)
        const viajesConCarga = (d.viajes || []).filter(
          (v: any) => Number(v.items) > 0 && Number(v.tiene_manifiesto_cerrado) > 0
        );
        if (!viajesConCarga.length) return null;

        return (
          <div style={{ marginBottom: 24 }}>
            <div className="dash-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e3a8a' }}>
                <span style={{ fontSize: 18 }}>🚍</span>
                <span>Turnos Listos para Carga y Salida — Manifiestos Oficiales</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                {viajesConCarga.length} unidad(es) asignadas
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
              {viajesConCarga.map((v: any) => {
                const tieneCerrado = Number(v.tiene_manifiesto_cerrado) > 0;
                const autorizada   = Number(v.autorizada_salida) > 0;
                const paradaNum    = v.parada_actual || 1;
                const linkEscanear = `/viajes/${v.id}/paradas/${paradaNum}`;
                const linkViaje    = `/viajes/${v.id}`;

                return (
                  <div
                    key={v.id}
                    className="card"
                    style={{
                      margin: 0,
                      padding: '16px 18px',
                      background: tieneCerrado ? 'linear-gradient(145deg, #ffffff, #f0f7ff)' : '#ffffff',
                      border: tieneCerrado ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                      boxShadow: tieneCerrado ? '0 4px 15px rgba(37, 99, 235, 0.08)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🚌</span>
                          <Link href={linkViaje} style={{ fontWeight: 800, fontSize: 16, color: '#1e3a8a', textDecoration: 'none' }}>
                            {v.vehiculo}
                          </Link>
                        </div>
                        <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3 }}>
                          <b>Ruta:</b> {v.ruta} · 📍 <b>Parada #{paradaNum}:</b> {v.parada_nombre || `Parada ${paradaNum}`}
                        </div>
                        {v.conductor && (
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            👤 <b>Chofer:</b> {v.conductor} {v.ayudante ? `· Ayudante: ${v.ayudante}` : ''}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        {tieneCerrado ? (
                          <span className="tag verde" style={{ fontSize: 11, fontWeight: 700 }}>
                            ✓ Manifiesto cerrado
                          </span>
                        ) : (
                          <span className="tag amarillo" style={{ fontSize: 11 }}>
                            Borrador
                          </span>
                        )}
                        <div style={{ marginTop: 4, fontWeight: 800, fontSize: 13, color: '#1e40af' }}>
                          📦 {v.items ?? 0} paquetes
                        </div>
                      </div>
                    </div>

                    {/* Botón único, claro e inteligente para Chofer y Ayudante */}
                    <div style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setModalViajeConfig({
                            abierto: true,
                            viajeId: v.id,
                            parada: paradaNum,
                            modo: autorizada ? 'salida' : 'carga',
                          })
                        }
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          fontSize: 14,
                          fontWeight: 800,
                          padding: '12px 18px',
                          background: autorizada
                            ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                            : 'linear-gradient(135deg, #1d4ed8 0%, #0f172a 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 10,
                          cursor: 'pointer',
                          boxShadow: autorizada
                            ? '0 4px 14px rgba(5, 150, 105, 0.35)'
                            : '0 4px 14px rgba(29, 78, 216, 0.30)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{autorizada ? '🚀' : '⚡'}</span>
                        <span>
                          {autorizada
                            ? `Salida Lista · Revisar o Partir (#${paradaNum})`
                            : `Operar Turno en Parada #${paradaNum} — ${v.parada_nombre || 'Parada Actual'}`}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SECCIÓN 1: ACCESO RÁPIDO / METRIC CARDS */}
      <div className="dash-section-title">
        <span>Estado Operativo en Tiempo Real</span>
      </div>

      <div className="dash-quick-grid">
        {puede(u, 'encomienda:crear') && (
          <>
            <div
              className={`dash-quick-card ${tabActiva === 'porRecibir' ? 'azul-activo' : ''}`}
              onClick={() => setTabActiva('porRecibir')}
              title="Click para ver paquetes por recibir en bodega"
            >
              <div className="dash-card-top">
                <span className="dash-card-sigla">REC</span>
                <span className={`dash-card-badge ${d.porRecibir.length > 0 ? 'alerta' : ''}`}>
                  {d.porRecibir.length > 0 ? 'Pendiente' : 'Al día'}
                </span>
              </div>
              <div>
                <div className="dash-card-num">{d.porRecibir.length}</div>
                <div className="dash-card-label">Por recibir en agencia</div>
              </div>
            </div>

            <div
              className={`dash-quick-card ${tabActiva === 'disponibles' ? 'azul-activo' : ''}`}
              onClick={() => setTabActiva('disponibles')}
              title="Click para ver paquetes listos para entrega al cliente"
            >
              <div className="dash-card-top">
                <span className="dash-card-sigla">ENT</span>
                <span className="dash-card-badge">En bodega</span>
              </div>
              <div>
                <div className="dash-card-num">{d.disponibles.length}</div>
                <div className="dash-card-label">Listos para retiro</div>
              </div>
            </div>
          </>
        )}

        <div
          className={`dash-quick-card ${tabActiva === 'viajes' ? 'azul-activo' : ''}`}
          onClick={() => setTabActiva('viajes')}
          title="Click para ver viajes y buses en ruta"
        >
          <div className="dash-card-top">
            <span className="dash-card-sigla">BUS</span>
            <span className="dash-card-badge">En ruta</span>
          </div>
          <div>
            <div className="dash-card-num">{d.viajes.length}</div>
            <div className="dash-card-label">Viajes activos hoy</div>
          </div>
        </div>

        {(puede(u, 'encomienda:crear') || puede(u, 'ver:todo')) && (
          <div
            className={`dash-quick-card ${tabActiva === 'redespachos' ? 'azul-activo' : ''}`}
            onClick={() => setTabActiva('redespachos')}
            title="Click para ver redespachos y conexiones intermedias"
          >
            <div className="dash-card-top">
              <span className="dash-card-sigla">RED</span>
              <span className={`dash-card-badge ${d.redespachos.some((r: any) => r.vencido) ? 'urgente' : ''}`}>
                {d.redespachos.some((r: any) => r.vencido) ? 'Vencidos' : 'Tránsito'}
              </span>
            </div>
            <div>
              <div className="dash-card-num">{d.redespachos.length}</div>
              <div className="dash-card-label">Redespachos pendientes</div>
            </div>
          </div>
        )}

        <div
          className={`dash-quick-card ${tabActiva === 'incidencias' ? 'azul-activo' : ''}`}
          onClick={() => setTabActiva('incidencias')}
          title="Click para revisar incidencias o reportes"
        >
          <div className="dash-card-top">
            <span className="dash-card-sigla" style={{ color: '#dc2626' }}>INC</span>
            <span className={`dash-card-badge ${d.incidencias.length > 0 ? 'urgente' : ''}`}>
              {d.incidencias.length > 0 ? 'Atención' : 'Sin alertas'}
            </span>
          </div>
          <div>
            <div className="dash-card-num">{d.incidencias.length}</div>
            <div className="dash-card-label">Incidencias abiertas</div>
          </div>
        </div>

        {puede(u, 'ver:todo') && (
          <div
            className="dash-quick-card"
            style={{ background: '#f8fafc' }}
            title="Paquetes registrados esperando bus de origen"
          >
            <div className="dash-card-top">
              <span className="dash-card-sigla">BOD</span>
              <span className="dash-card-badge">Sin bus</span>
            </div>
            <div>
              <div className="dash-card-num">{d.sinViaje}</div>
              <div className="dash-card-label">Paquetes en bodega origen</div>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: SELECTOR DE PESTAÑAS (TABS) */}
      <div className="dash-section-title">
        <span>Módulos de Gestión</span>
      </div>

      <div className="dash-tabs-bar noprint">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`dash-tab-btn ${tabActiva === t.id ? 'activo' : ''}`}
            onClick={() => setTabActiva(t.id)}
          >
            <span>{t.label}</span>
            {t.count !== null && <span className="dash-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* SECCIÓN 3: CONTENIDO DE LAS PESTAÑAS */}

      {/* TAB: TODOS (PANORÁMICA COMPLETA DE UNA SOLA PANTALLA) */}
      {tabActiva === 'todos' && (
        <div className="dash-overview-grid">
          {/* 1. POR RECIBIR */}
          {puede(u, 'encomienda:crear') && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Por recibir ({d.porRecibir.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('porRecibir')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.porRecibir.slice(0, 4).map((b: any) => (
                      <tr key={b.id}>
                        <td className="mono" style={{ fontWeight: 700, color: '#1e3a8a' }}>{b.codigo_legible}</td>
                        <td style={{ color: '#475569' }}>{b.enc_codigo}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>{b.agencia}</td>
                      </tr>
                    ))}
                    {!d.porRecibir.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>Sin paquetes pendientes de recepción</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>Total en tránsito: {d.porRecibir.length}</span>
                <Link href="/recepcion" style={{ color: '#1d4ed8', fontWeight: 600 }}>Recepción ➔</Link>
              </div>
            </div>
          )}

          {/* 2. DISPONIBLES / LISTOS PARA RETIRO */}
          {puede(u, 'encomienda:crear') && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Listos para retiro ({d.disponibles.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('disponibles')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.disponibles.slice(0, 4).map((e: any) => (
                      <tr key={e.id}>
                        <td><Link href={'/encomiendas/' + e.id} style={{ fontWeight: 700 }}>{e.codigo}</Link></td>
                        <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.dest_nombre}</td>
                        <td style={{ textAlign: 'right' }}><Estado e={e.estado} /></td>
                      </tr>
                    ))}
                    {!d.disponibles.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay paquetes listos para entregar</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>En bodega destino: {d.disponibles.length}</span>
                <Link href="/entrega" style={{ color: '#059669', fontWeight: 600 }}>Entregar ➔</Link>
              </div>
            </div>
          )}

          {/* 3. VIAJES Y UNIDADES */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Viajes activos ({d.viajes.length})</h2>
                <button type="button" className="dash-compact-link" onClick={() => setTabActiva('viajes')}>
                  Ver todos →
                </button>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {d.viajes.slice(0, 4).map((v: any) => (
                    <tr key={v.id}>
                      <td><Link href={'/viajes/' + v.id} style={{ fontWeight: 700 }}>{v.vehiculo}</Link></td>
                      <td style={{ fontSize: '11.5px', color: '#475569' }}>{v.ruta}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`tag ${v.estado === 'en_ruta' ? 'verde' : ''}`} style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                          {v.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!d.viajes.length && (
                    <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay turnos activos en ruta</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>Unidades en monitoreo: {d.viajes.length}</span>
              <Link href="/viajes" style={{ color: '#1d4ed8', fontWeight: 600 }}>Ver Viajes ➔</Link>
            </div>
          </div>

          {/* 4. REDESPACHOS */}
          {(puede(u, 'encomienda:crear') || puede(u, 'ver:todo')) && (
            <div className="dash-compact-card">
              <div>
                <div className="dash-compact-header">
                  <h2>Redespachos ({d.redespachos.length})</h2>
                  <button type="button" className="dash-compact-link" onClick={() => setTabActiva('redespachos')}>
                    Ver todos →
                  </button>
                </div>
                <table className="dash-compact-table">
                  <tbody>
                    {d.redespachos.slice(0, 4).map((r: any) => (
                      <tr key={r.id}>
                        <td className="mono" style={{ fontWeight: 700 }}>{r.codigo_legible}</td>
                        <td style={{ fontSize: '11.5px' }}>{r.agencia} → {r.destino}</td>
                        <td style={{ textAlign: 'right' }}>
                          {r.vencido ? <span className="tag rojo" style={{ fontSize: '10px' }}>Vencido</span> : <span className="tag" style={{ fontSize: '10px' }}>Al día</span>}
                        </td>
                      </tr>
                    ))}
                    {!d.redespachos.length && (
                      <tr><td colSpan={3} className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>No hay paquetes con redespacho</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dash-compact-footer">
                <span>Por reasignar bus: {d.redespachos.length}</span>
                <Link href="/redespachos" style={{ color: '#1d4ed8', fontWeight: 600 }}>Módulo ➔</Link>
              </div>
            </div>
          )}

          {/* 5. INCIDENCIAS */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Incidencias ({d.incidencias.length})</h2>
                <button type="button" className="dash-compact-link" onClick={() => setTabActiva('incidencias')}>
                  Ver todos →
                </button>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {d.incidencias.slice(0, 4).map((i: any) => (
                    <tr key={i.id}>
                      <td><span className="tag rojo" style={{ fontSize: '10.5px', padding: '1px 6px' }}>{i.tipo}</span></td>
                      <td className="mono" style={{ fontSize: '11.5px' }}>{i.codigo_legible || 'N/A'}</td>
                      <td style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>{fechaEC(i.abierta_at)}</td>
                    </tr>
                  ))}
                  {!d.incidencias.length && (
                    <tr><td colSpan={3} style={{ color: '#059669', padding: '20px 0', textAlign: 'center' }}>Cero incidencias reportadas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>Novedades abiertas: {d.incidencias.length}</span>
              <Link href="/incidencias" style={{ color: '#dc2626', fontWeight: 600 }}>Gestionar ➔</Link>
            </div>
          </div>

          {/* 6. DISTRIBUCIÓN DE PAQUETES / ESTADO GENERAL */}
          <div className="dash-compact-card">
            <div>
              <div className="dash-compact-header">
                <h2>Paquetes del Sistema</h2>
                <span className="tag" style={{ fontSize: '11px' }}>Global</span>
              </div>
              <table className="dash-compact-table">
                <tbody>
                  {(d.porEstado || []).slice(0, 4).map((e: any) => (
                    <tr key={e.estado}>
                      <td><Estado e={e.estado} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{e.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dash-compact-footer">
              <span>En custodia origen (sin bus):</span>
              <b>{d.sinViaje}</b>
            </div>
          </div>
        </div>
      )}

      {/* TAB: POR RECIBIR */}
      {tabActiva === 'porRecibir' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Paquetes descargados por recibir en bodega ({d.porRecibir.length})</h2>
            <Link href="/recepcion" className="btn">Escanear Recepción ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Código Paquete</th><th>Encomienda</th><th>Agencia Custodia Actual</th><th>Acción</th></tr></thead>
              <tbody>
                {d.porRecibir.map((b: any) => (
                  <tr key={b.id}>
                    <td className="mono" style={{ fontSize: '15px' }}><b>{b.codigo_legible}</b></td>
                    <td>{b.enc_codigo}</td>
                    <td>{b.agencia}</td>
                    <td>
                      <Link href="/recepcion" className="btn sec" style={{ padding: '3px 10px', fontSize: '12px' }}>
                        Recibir
                      </Link>
                    </td>
                  </tr>
                ))}
                {!d.porRecibir.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay paquetes pendientes de recepción en tu bodega.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: LISTOS PARA ENTREGA */}
      {tabActiva === 'disponibles' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Paquetes disponibles para entrega o retiro ({d.disponibles.length})</h2>
            <Link href="/entrega" className="btn verde">Registrar Entrega ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Código Encomienda</th><th>Destinatario</th><th>Agencia Retiro</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>
                {d.disponibles.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: '14.5px' }}><Link href={'/encomiendas/' + e.id}><b>{e.codigo}</b></Link></td>
                    <td><b>{e.dest_nombre}</b></td>
                    <td>{e.destino}</td>
                    <td><Estado e={e.estado} /></td>
                    <td>
                      <Link href={'/encomiendas/' + e.id} className="btn sec" style={{ padding: '3px 10px', fontSize: '12px' }}>
                        Ver Guía
                      </Link>
                    </td>
                  </tr>
                ))}
                {!d.disponibles.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay encomiendas listas para entrega en este momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: VIAJES ACTIVOS */}
      {tabActiva === 'viajes' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Turnos y Viajes en Tránsito ({d.viajes.length})</h2>
            <Link href="/viajes" className="btn">Ver todos los viajes ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead>
                <tr>
                  <th>Unidad / Bus</th>
                  <th>Ruta Asignada</th>
                  <th>Tripulación</th>
                  <th>Paquetes</th>
                  <th>Parada Actual</th>
                  <th>Estado</th>
                  <th style={{ minWidth: 160 }}>Acciones Rápidas</th>
                </tr>
              </thead>
              <tbody>
                {d.viajes.map((v: any) => {
                  const paradaNum = v.parada_actual || 1;
                  return (
                    <tr key={v.id}>
                      <td style={{ fontSize: '15px' }}>
                        <Link href={'/viajes/' + v.id}><b>{v.vehiculo}</b></Link>
                      </td>
                      <td><b>{v.ruta}</b></td>
                      <td style={{ fontSize: '12.5px', color: '#475569' }}>
                        {v.conductor ? <div>👤 {v.conductor}</div> : <span className="muted">Sin chofer</span>}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '2px 8px', borderRadius: 999, fontWeight: 700, fontSize: 12,
                          background: Number(v.items) > 0 ? '#eff6ff' : '#f1f5f9',
                          color: Number(v.items) > 0 ? '#1d4ed8' : '#64748b',
                        }}>
                          📦 {v.items ?? 0}
                        </span>
                      </td>
                      <td>Parada #{paradaNum} {v.parada_nombre ? `(${v.parada_nombre})` : ''}</td>
                      <td>
                        <span className={`tag ${v.estado === 'en_ruta' ? 'verde' : ''}`}>
                          {v.estado}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Link
                            href={`/viajes/${v.id}/paradas/${paradaNum}?modo=carga`}
                            className="btn"
                            style={{ padding: '3px 8px', fontSize: '11.5px', background: '#2563eb', color: '#fff', border: 'none' }}
                            title="Subir paquetes a bordo en esta parada"
                          >
                            ⬆️ Subir
                          </Link>
                          <Link
                            href={`/viajes/${v.id}/paradas/${paradaNum}#salida`}
                            className="btn"
                            style={{ padding: '3px 8px', fontSize: '11.5px', background: '#0f172a', color: '#fff', border: 'none' }}
                            title="Verificar y autorizar partida del bus"
                          >
                            🚀 Salida
                          </Link>
                          <Link
                            href={`/viajes/${v.id}`}
                            className="btn sec"
                            style={{ padding: '3px 8px', fontSize: '11.5px' }}
                          >
                            Manifiesto
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!d.viajes.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay viajes activos programados actualmente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: REDESPACHOS */}
      {tabActiva === 'redespachos' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Redespachos Intermedios ({d.redespachos.length})</h2>
            <Link href="/redespachos" className="btn">Ir a Redespachos ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Paquete</th><th>Encomienda</th><th>Agencia Custodia</th><th>Destino Final</th><th>Plazo Límite</th></tr></thead>
              <tbody>
                {d.redespachos.map((r: any) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: '14.5px' }}><b>{r.codigo_legible}</b></td>
                    <td>{r.enc_codigo}</td>
                    <td>{r.agencia}</td>
                    <td><b>{r.destino}</b></td>
                    <td>{r.vencido ? <span className="tag rojo">VENCIDO</span> : <span className="tag">vence {fechaEC(r.due_at)}</span>}</td>
                  </tr>
                ))}
                {!d.redespachos.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                      No hay paquetes con redespachos pendientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: INCIDENCIAS */}
      {tabActiva === 'incidencias' && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Reportes de Incidencias Activas ({d.incidencias.length})</h2>
            <Link href="/incidencias" className="btn rojo">Gestionar Incidencias ➔</Link>
          </div>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Tipo de Novedad</th><th>Código de Paquete</th><th>Fecha de Reporte</th><th>Estado</th></tr></thead>
              <tbody>
                {d.incidencias.map((i: any) => (
                  <tr key={i.id}>
                    <td><span className="tag rojo"><b>{i.tipo}</b></span></td>
                    <td className="mono" style={{ fontSize: '14.5px' }}><b>{i.codigo_legible || 'Sin código'}</b></td>
                    <td>{fechaEC(i.abierta_at)}</td>
                    <td><span className="tag amarillo">Pendiente resolución</span></td>
                  </tr>
                ))}
                {!d.incidencias.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: '#059669' }}>
                      No hay incidencias abiertas. Toda la operación está funcionando con normalidad.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: AUDITORÍA (SUPERVISORES Y GERENCIA) */}
      {tabActiva === 'auditoria' && sup && (
        <div className="dash-tab-panel">
          <div className="dash-panel-header">
            <h2>Auditoría de Operaciones y Excepciones</h2>
            {puede(u, 'export:csv') && (
              <a className="btn sec" href="/api/export/eventos">
                Descargar CSV Completo
              </a>
            )}
          </div>

          <h3 style={{ fontSize: '15px', color: '#0f172a', marginTop: 14 }}>Excepciones de salida autorizadas</h3>
          <div className="tabla-scroll" style={{ marginBottom: 20 }}>
            <table className="tabla-fija">
              <thead><tr><th>Fecha</th><th>Autorizado Por</th><th>Motivo</th></tr></thead>
              <tbody>
                {d.excepciones?.map((x: any) => (
                  <tr key={x.id}>
                    <td>{fechaEC(x.autorizado_at)}</td>
                    <td><b>{x.autorizado_por}</b></td>
                    <td>{x.motivo}</td>
                  </tr>
                ))}
                {!d.excepciones?.length && <tr><td colSpan={3} className="muted">Sin excepciones registradas</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: '15px', color: '#0f172a' }}>Modificaciones de manifiesto</h3>
          <div className="tabla-scroll">
            <table className="tabla-fija">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Motivo Declarado</th></tr></thead>
              <tbody>
                {d.modificaciones?.map((m: any, i: number) => {
                  let p: any = {};
                  try { p = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload; } catch {}
                  return (
                    <tr key={i}>
                      <td>{fechaEC(m.recibido_servidor)}</td>
                      <td><b>{m.nombre}</b></td>
                      <td>{p?.motivo || 'Sin motivo'}</td>
                    </tr>
                  );
                })}
                {!d.modificaciones?.length && <tr><td colSpan={3} className="muted">Sin modificaciones registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EXPRESS DE NUEVA ENCOMIENDA INVOCADO DESDE EL PANEL */}
      {catalogo && (
        <NuevaEncomiendaModal
          isOpen={modalNuevaAbierto}
          onClose={() => setModalNuevaAbierto(false)}
          catalogo={catalogo}
          usuario={u}
          onSuccess={() => {
            cargar();
          }}
        />
      )}

      {/* ASISTENTE MODAL PARA OPERACIONES DE TRIPULACIÓN EN RUTA */}
      {modalViajeConfig.viajeId && (
        <OperacionViajeModal
          viajeId={modalViajeConfig.viajeId}
          paradaInicial={modalViajeConfig.parada}
          modoInicial={modalViajeConfig.modo}
          abierto={modalViajeConfig.abierto}
          onCerrar={() => setModalViajeConfig((prev) => ({ ...prev, abierto: false }))}
          onActualizado={() => {
            cargar();
          }}
        />
      )}
    </div>
  );
}
