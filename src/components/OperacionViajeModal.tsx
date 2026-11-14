'use client';
import { useEffect, useState, useCallback, useId } from 'react';
import Link from 'next/link';
import { llamar, nuevoEventId, fmtLegible, fechaEC } from '@/lib/cliente';
import { Error_, Estado, Scanner } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { puede } from '@/shared/permisos';

interface Props {
  viajeId: string;
  paradaInicial?: number;
  modoInicial?: 'carga' | 'descarga' | 'salida';
  abierto: boolean;
  onCerrar: () => void;
  onActualizado?: () => void;
}

export default function OperacionViajeModal({
  viajeId,
  paradaInicial = 1,
  modoInicial = 'carga',
  abierto,
  onCerrar,
  onActualizado,
}: Props) {
  const u = useUsuario();
  const inputManualId = useId();

  // Estados de datos
  const [dataParada, setDataParada] = useState<any>(null);
  const [paradaSeleccionada, setParadaSeleccionada] = useState<number>(paradaInicial);
  const [modo, setModo] = useState<'carga' | 'descarga' | 'salida'>(modoInicial);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [okMsg, setOkMsg] = useState('');

  // Estados de escaneo y lectura rápida
  const [codigoManual, setCodigoManual] = useState('');
  const [historialEscaneos, setHistorialEscaneos] = useState<any[]>([]);
  const [ultimoResultado, setUltimoResultado] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mostrarCamara, setMostrarCamara] = useState(false);

  // Estados de autorización / excepción
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [exc, setExc] = useState({ motivo: '', solicitadoPor: '' });

  // Sincronizar props cuando se abre
  useEffect(() => {
    if (abierto) {
      setParadaSeleccionada(paradaInicial);
      setModo(modoInicial);
      setErr(null);
      setOkMsg('');
      setUltimoResultado(null);
    }
  }, [abierto, paradaInicial, modoInicial]);

  // Cargar lista de usuarios para posibles excepciones
  useEffect(() => {
    if (abierto) {
      llamar('/api/usuarios').then(setUsuarios).catch(() => {});
    }
  }, [abierto]);

  // Cargar datos de la parada
  const cargarParada = useCallback(async (paradaOrden: number) => {
    if (!viajeId) return;
    setCargando(true);
    setErr(null);
    try {
      const res = await llamar(`/api/viajes/${viajeId}/paradas/${paradaOrden}`);
      setDataParada(res);
    } catch (e: any) {
      setErr(e);
      setDataParada(null);
    } finally {
      setCargando(false);
    }
  }, [viajeId]);

  useEffect(() => {
    if (abierto && viajeId) {
      cargarParada(paradaSeleccionada);
    }
  }, [abierto, viajeId, paradaSeleccionada, cargarParada]);

  // Manejador de acciones generales
  const ejecutarAccion = async (fn: () => Promise<any>, msg: string) => {
    setErr(null);
    setOkMsg('');
    try {
      await fn();
      setOkMsg(msg);
      if (onActualizado) onActualizado();
    } catch (e) {
      setErr(e);
    } finally {
      await cargarParada(paradaSeleccionada);
    }
  };

  // Escaneo o ingreso de código de bulto
  const procesarBulto = async (cod: string) => {
    const limpio = (cod || '').trim();
    if (!limpio) return;

    setErr(null);
    setOcupado(true);
    setCodigoManual('');

    try {
      const tipoEscaneo = modo === 'descarga' ? 'descarga' : 'carga';
      const r: any = await llamar('/api/escaneos', 'POST', {
        eventId: nuevoEventId(),
        tipo: tipoEscaneo,
        viajeId,
        parada: paradaSeleccionada,
        codigo: limpio,
        deviceId: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'modal-tripulacion',
      });

      setUltimoResultado(r);
      setHistorialEscaneos((prev) => [
        { ...r, codigo: limpio, tipo: tipoEscaneo, hora: new Date() },
        ...prev.slice(0, 9),
      ]);

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(r.resultado === 'ok' ? 80 : [200, 80, 200]);
      }

      if (onActualizado) onActualizado();
      await cargarParada(paradaSeleccionada);
    } catch (e) {
      setErr(e);
      setUltimoResultado(null);
    } finally {
      setOcupado(false);
    }
  };

  if (!abierto) return null;

  const ev = dataParada?.evaluacion;
  const aut = dataParada?.autorizacion;
  const viaje = dataParada?.viaje;
  const parada = dataParada?.parada;
  const bultos = dataParada?.bultos || [];
  const paradasLista = dataParada?.paradas || [];

  const enParada = viaje ? viaje.parada_actual === paradaSeleccionada : true;
  const bultosSube = bultos.filter((b: any) => b.rol === 'sube');
  const bultosBaja = bultos.filter((b: any) => b.rol === 'baja');
  const bultosContinua = bultos.filter((b: any) => b.rol === 'continua');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 25, 47, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-tripulacion-title"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── CABECERA PRINCIPAL ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0a192f 0%, #1e3a8a 100%)',
            color: '#ffffff',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24 }}>🚍</span>
              <h2 id="modal-tripulacion-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
                {viaje ? `${viaje.vehiculo} · ${viaje.ruta}` : 'Operación de Turno'}
              </h2>
              {dataParada?.version && (
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Manifiesto v{dataParada.version}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
              📍 <b>Parada seleccionada #{paradaSeleccionada}:</b> {parada?.nombre || 'Cargando...'}
              {viaje && viaje.parada_actual !== paradaSeleccionada && (
                <span style={{ marginLeft: 8, color: '#fbbf24', fontWeight: 700 }}>
                  (Bus actualmente en parada #{viaje.parada_actual})
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onCerrar}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              color: '#ffffff',
              fontSize: 20,
              width: 36,
              height: 36,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* ── SELECTOR DE PARADAS (STEPPER HORIZONTAL) ── */}
        {paradasLista.length > 0 && (
          <div
            style={{
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              overflowX: 'auto',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginRight: 4 }}>
              Ruta:
            </span>
            {paradasLista.map((p: any) => {
              const esActualDelBus = viaje?.parada_actual === p.orden;
              const esSeleccionada = paradaSeleccionada === p.orden;
              return (
                <button
                  key={p.id}
                  onClick={() => setParadaSeleccionada(p.orden)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12.5,
                    fontWeight: esSeleccionada ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    border: esSeleccionada
                      ? '2px solid #2563eb'
                      : esActualDelBus
                      ? '2px solid #10b981'
                      : '1px solid #cbd5e1',
                    background: esSeleccionada
                      ? '#eff6ff'
                      : esActualDelBus
                      ? '#ecfdf5'
                      : '#ffffff',
                    color: esSeleccionada
                      ? '#1d4ed8'
                      : esActualDelBus
                      ? '#065f46'
                      : '#475569',
                    boxShadow: esSeleccionada ? '0 2px 8px rgba(37,99,235,0.18)' : 'none',
                  }}
                >
                  <span>{esActualDelBus ? '📍' : `#${p.orden}`}</span>
                  <span>{p.nombre}</span>
                  {esActualDelBus && (
                    <span style={{ fontSize: 10, background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: 10 }}>
                      Aquí
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── BOTONES DE MODO: DESCARGA / CARGA / SALIDA ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            padding: '12px 24px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <button
            type="button"
            onClick={() => setModo('descarga')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: modo === 'descarga' ? '2.5px solid #d97706' : '1.5px solid #e2e8f0',
              background: modo === 'descarga' ? '#fffbeb' : '#ffffff',
              color: modo === 'descarga' ? '#b45309' : '#64748b',
              boxShadow: modo === 'descarga' ? '0 3px 10px rgba(217,119,6,0.18)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 16 }}>⬇️</span>
            <span>Bajar ({bultosBaja.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setModo('carga')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: modo === 'carga' ? '2.5px solid #2563eb' : '1.5px solid #e2e8f0',
              background: modo === 'carga' ? '#eff6ff' : '#ffffff',
              color: modo === 'carga' ? '#1d4ed8' : '#64748b',
              boxShadow: modo === 'carga' ? '0 3px 10px rgba(37,99,235,0.18)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 16 }}>⬆️</span>
            <span>Subir ({bultosSube.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setModo('salida')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: modo === 'salida' ? '2.5px solid #059669' : '1.5px solid #e2e8f0',
              background: modo === 'salida' ? '#ecfdf5' : '#ffffff',
              color: modo === 'salida' ? '#065f46' : '#64748b',
              boxShadow: modo === 'salida' ? '0 3px 10px rgba(5,150,105,0.18)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 16 }}>🚀</span>
            <span>Salida {aut ? '✓' : ''}</span>
          </button>
        </div>

        {/* ── CUERPO PRINCIPAL DEL MODAL ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <Error_ e={err} />
          {okMsg && (
            <div className="okmsg" style={{ marginBottom: 14 }}>
              {okMsg}
            </div>
          )}

          {!enParada && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: paradaSeleccionada < (viaje?.parada_actual || 1) ? '#fee2e2' : '#fef3c7',
                color: paradaSeleccionada < (viaje?.parada_actual || 1) ? '#991b1b' : '#92400e',
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              {paradaSeleccionada < (viaje?.parada_actual || 1)
                ? `⚠️ Esta parada ya fue completada. El bus se encuentra en la Parada #${viaje?.parada_actual}.`
                : `⏳ El bus aún no llega aquí físicamente. Está en la Parada #${viaje?.parada_actual}.`}
            </div>
          )}

          {cargando ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              Cargando información oficial del manifiesto...
            </div>
          ) : (
            <>
              {/* VISTA 1 & 2: ESCANEO Y LISTADO (CARGA O DESCARGA) */}
              {(modo === 'carga' || modo === 'descarga') && (
                <div>
                  {/* BARRA DE ESCANEO RÁPIDO */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 16,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ flex: '1 1 240px', display: 'flex', gap: 8 }}>
                        <label htmlFor={inputManualId} style={{ display: 'none' }}>
                          Código de bulto
                        </label>
                        <input
                          id={inputManualId}
                          type="text"
                          value={codigoManual}
                          onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') procesarBulto(codigoManual);
                          }}
                          placeholder={
                            modo === 'carga'
                              ? 'Escanear o digitar código para SUBIR...'
                              : 'Escanear o digitar código para BAJAR...'
                          }
                          style={{
                            flex: 1,
                            padding: '10px 14px',
                            fontSize: 14,
                            fontWeight: 600,
                            borderRadius: 8,
                            border: '1.5px solid #cbd5e1',
                          }}
                          disabled={ocupado}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => procesarBulto(codigoManual)}
                          disabled={ocupado || !codigoManual.trim()}
                          className="btn"
                          style={{
                            padding: '10px 16px',
                            fontWeight: 700,
                            background: modo === 'carga' ? '#2563eb' : '#d97706',
                            color: '#fff',
                            borderRadius: 8,
                            border: 'none',
                          }}
                        >
                          {ocupado ? '...' : 'Registrar'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setMostrarCamara(!mostrarCamara)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: mostrarCamara ? '#0f172a' : '#ffffff',
                          color: mostrarCamara ? '#ffffff' : '#334155',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📷 {mostrarCamara ? 'Ocultar Cámara' : 'Usar Cámara'}
                      </button>
                    </div>

                    {/* Escáner de cámara */}
                    {mostrarCamara && (
                      <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden' }}>
                        <Scanner onCode={(txt: string) => procesarBulto(txt)} ocupado={ocupado} />
                      </div>
                    )}

                    {/* Feedback del último resultado escaneado */}
                    {ultimoResultado && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 700,
                          background: ultimoResultado.resultado === 'ok' ? '#ecfdf5' : '#fee2e2',
                          color: ultimoResultado.resultado === 'ok' ? '#065f46' : '#991b1b',
                          border:
                            ultimoResultado.resultado === 'ok' ? '1px solid #a7f3d0' : '1px solid #fecdd3',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          {ultimoResultado.resultado === 'ok' ? '✓ Registrado con éxito: ' : '✕ Discrepancia: '}
                          {ultimoResultado.mensaje || (ultimoResultado.bulto ? `Bulto ${ultimoResultado.bulto}` : '')}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500 }}>
                          {new Date().toLocaleTimeString('es-EC')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* TABLA DE BULTOS DEL MODO SELECCIONADO */}
                  <div style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                        {modo === 'carga'
                          ? `Paquetes que SUBEN en esta parada (${bultosSube.length})`
                          : `Paquetes que BAJAN en esta parada (${bultosBaja.length})`}
                      </h3>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        A bordo continúan: <b>{bultosContinua.length}</b> bulto(s)
                      </span>
                    </div>

                    {((modo === 'carga' ? bultosSube : bultosBaja).length === 0) ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '28px 16px',
                          background: '#f8fafc',
                          borderRadius: 10,
                          border: '1px dashed #cbd5e1',
                          color: '#64748b',
                          fontSize: 13,
                        }}
                      >
                        {modo === 'carga'
                          ? 'No hay paquetes registrados para subir en esta parada.'
                          : 'No hay paquetes con destino de descarga en esta parada.'}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                              <th style={{ padding: '8px 12px' }}>Código Bulto</th>
                              <th style={{ padding: '8px 12px' }}>Encomienda</th>
                              <th style={{ padding: '8px 12px' }}>Destinatario</th>
                              <th style={{ padding: '8px 12px' }}>Estado</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(modo === 'carga' ? bultosSube : bultosBaja).map((b: any) => {
                              const esPendienteCarga = modo === 'carga' && b.estado !== 'cargado';
                              const tieneFaltante = dataParada?.incidencias?.some(
                                (inc: any) => inc.tipo === 'faltante' && inc.codigo_legible === b.codigo
                              );

                              return (
                                <tr
                                  key={b.bultoId}
                                  style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: b.estado === 'cargado' && modo === 'carga' ? '#f0fdf4' : '#ffffff',
                                  }}
                                >
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                      {fmtLegible(b.codigo)}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {b.encomienda} #{b.numero}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>{b.dest_nombre || '-'}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <Estado e={b.estado} />
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    {enParada && (
                                      <div style={{ display: 'inline-flex', gap: 6 }}>
                                        {/* Botón rápido para marcar si no se tiene escáner */}
                                        <button
                                          type="button"
                                          onClick={() => procesarBulto(b.codigo)}
                                          disabled={ocupado}
                                          style={{
                                            padding: '5px 10px',
                                            fontSize: 11.5,
                                            fontWeight: 800,
                                            borderRadius: 6,
                                            border: modo === 'carga' ? '1px solid #1d4ed8' : '1px solid #b45309',
                                            background: modo === 'carga' ? '#1e40af' : '#d97706',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                          }}
                                          title="Registrar manualmente"
                                        >
                                          ✓ {modo === 'carga' ? 'Subir' : 'Bajar'}
                                        </button>

                                        {/* Reportar faltante */}
                                        {esPendienteCarga && !tieneFaltante && puede(u, 'escaneo:operar') && (
                                          <button
                                            type="button"
                                            style={{
                                              padding: '4px 8px',
                                              fontSize: 11,
                                              fontWeight: 700,
                                              borderRadius: 6,
                                              border: '1px solid #fca5a5',
                                              background: '#fff1f2',
                                              color: '#9f1239',
                                              cursor: 'pointer',
                                            }}
                                            onClick={() => {
                                              const razon = prompt(
                                                `Indica el motivo de por qué no se encuentra el paquete ${fmtLegible(
                                                  b.codigo
                                                )}:`
                                              );
                                              if (!razon || !razon.trim()) return;
                                              ejecutarAccion(
                                                () =>
                                                  llamar('/api/incidencias', 'POST', {
                                                    tipo: 'faltante',
                                                    codigo: b.codigo,
                                                    viajeId,
                                                    nota: razon.trim(),
                                                  }),
                                                'Faltante registrado'
                                              );
                                            }}
                                          >
                                            ⚠️ Faltante
                                          </button>
                                        )}

                                        {tieneFaltante && (
                                          <span
                                            style={{
                                              padding: '2px 6px',
                                              borderRadius: 4,
                                              fontSize: 10,
                                              fontWeight: 700,
                                              background: '#fee2e2',
                                              color: '#991b1b',
                                            }}
                                          >
                                            Faltante reportado
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VISTA 3: AUTORIZACIÓN DE SALIDA Y CONCILIACIÓN */}
              {modo === 'salida' && (
                <div>
                  <div
                    style={{
                      borderLeft: '5px solid #10b981',
                      background: '#f8fafc',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        🚀 Estado de Salida del Bus — Parada #{paradaSeleccionada}
                      </h3>
                      {aut && (
                        <span
                          style={{
                            background: '#dcfce7',
                            color: '#166534',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          ✓ Autorizada ({aut.tipo})
                        </span>
                      )}
                    </div>

                    {/* Mensaje de conciliación de carga */}
                    {ev?.normalPermitida ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          fontSize: 13,
                          marginBottom: 14,
                        }}
                      >
                        ✓ <b>Conciliación exitosa:</b> Se esperan {ev.esperadoABordo} paquete(s) a bordo al partir hacia
                        la siguiente parada.
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          background: '#fee2e2',
                          border: '1px solid #fecdd3',
                          color: '#991b1b',
                          fontSize: 13,
                          marginBottom: 14,
                        }}
                      >
                        <b style={{ display: 'block', marginBottom: 4 }}>Salida bloqueada por discrepancias:</b>
                        {(ev?.mensajes || []).map((m: string, i: number) => (
                          <div key={i} style={{ marginTop: 2 }}>
                            • {m}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botones de acción de salida */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                      {enParada && !aut && puede(u, 'salida:autorizar') && (
                        <button
                          type="button"
                          disabled={!ev?.normalPermitida}
                          onClick={() =>
                            ejecutarAccion(
                              () =>
                                llamar(
                                  `/api/viajes/${viajeId}/paradas/${paradaSeleccionada}/autorizar`,
                                  'POST',
                                  { tipo: 'normal' }
                                ),
                              'Salida autorizada exitosamente'
                            )
                          }
                          style={{
                            padding: '12px 20px',
                            fontSize: 14,
                            fontWeight: 800,
                            borderRadius: 8,
                            background: ev?.normalPermitida ? '#10b981' : '#cbd5e1',
                            color: '#ffffff',
                            border: 'none',
                            cursor: ev?.normalPermitida ? 'pointer' : 'not-allowed',
                            boxShadow: ev?.normalPermitida ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                          }}
                        >
                          ✓ Autorizar Partida del Bus
                        </button>
                      )}

                      {enParada && aut && !aut.salida_real_at && puede(u, 'salida:registrar_real') && (
                        <button
                          type="button"
                          onClick={() =>
                            ejecutarAccion(
                              () =>
                                llamar(
                                  `/api/viajes/${viajeId}/paradas/${paradaSeleccionada}/salida-real`,
                                  'POST'
                                ),
                              'Salida real confirmada: El bus ha partido'
                            )
                          }
                          style={{
                            padding: '12px 20px',
                            fontSize: 14,
                            fontWeight: 800,
                            borderRadius: 8,
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(15,23,42,0.3)',
                          }}
                        >
                          🚀 Registrar Partida Real del Bus
                        </button>
                      )}

                      {aut?.salida_real_at && (
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          ✓ Salida registrada a las {fechaEC(aut.salida_real_at)}
                        </div>
                      )}
                    </div>

                    {/* Formulario de Excepción A si está bloqueada */}
                    {enParada &&
                      !aut &&
                      !ev?.normalPermitida &&
                      ev?.excepcionPermitida === 'A' &&
                      puede(u, 'excepcion:autorizar') && (
                        <div
                          style={{
                            marginTop: 16,
                            padding: 14,
                            background: '#fff1f2',
                            border: '1px solid #fecdd3',
                            borderRadius: 8,
                          }}
                        >
                          <h4 style={{ margin: '0 0 8px', color: '#9f1239', fontSize: 13, fontWeight: 800 }}>
                            ⚠️ Autorización de Excepción A (Supervisor / Chofer Responsable)
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                                Motivo de la excepción:
                              </label>
                              <input
                                type="text"
                                value={exc.motivo}
                                onChange={(e) => setExc({ ...exc, motivo: e.target.value })}
                                placeholder="Ej: bulto faltante retenido en bodega"
                                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                                Personal que solicita:
                              </label>
                              <select
                                value={exc.solicitadoPor}
                                onChange={(e) => setExc({ ...exc, solicitadoPor: e.target.value })}
                                style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
                              >
                                <option value="">-- Seleccionar --</option>
                                {usuarios
                                  .filter((x) => x.id !== u.id)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.nombre}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!exc.motivo.trim() || !exc.solicitadoPor}
                            onClick={() =>
                              ejecutarAccion(
                                () =>
                                  llamar(
                                    `/api/viajes/${viajeId}/paradas/${paradaSeleccionada}/autorizar`,
                                    'POST',
                                    { tipo: 'excepcion_a', ...exc }
                                  ),
                                'Excepción A autorizada'
                              )
                            }
                            style={{
                              padding: '8px 16px',
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: exc.motivo.trim() && exc.solicitadoPor ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Autorizar con Excepción A
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── PIE DEL MODAL CON ACCIONES SECUNDARIAS ── */}
        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <Link
            href={`/viajes/${viajeId}`}
            style={{ fontSize: 13, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
          >
            📋 Ver detalle completo del viaje
          </Link>

          <button
            type="button"
            onClick={onCerrar}
            className="btn sec"
            style={{ padding: '8px 18px', fontWeight: 700, borderRadius: 8 }}
          >
            Cerrar Asistente
          </button>
        </div>
      </div>
    </div>
  );
}
