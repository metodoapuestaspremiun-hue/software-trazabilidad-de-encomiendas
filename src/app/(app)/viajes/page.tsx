'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';

export default function Viajes() {
  const u = useUsuario();
  const [v, setV] = useState<any[]>([]);
  const [err, setErr] = useState<any>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState('');
  // Por defecto, mostrar solo viajes con encomiendas
  const [soloConCarga, setSoloConCarga] = useState<boolean>(true);

  const cargar = () => {
    llamar('/api/viajes').then(setV).catch(setErr);
  };

  useEffect(() => {
    cargar();
  }, []);

  const viajesConCargaCount = useMemo(() => {
    return v.filter(x => Number(x.items) > 0).length;
  }, [v]);

  const viajesFiltrados = useMemo(() => {
    if (!soloConCarga) return v;
    return v.filter(x => Number(x.items) > 0);
  }, [v, soloConCarga]);

  const reiniciarTodo = async () => {
    const confirmacion = window.confirm(
      '¿Deseas reiniciar la demostración?\n\n' +
      'Esto dejará el sistema limpio con 6 turnos fijos programados (Quito-Loja-Zumba) para poder hacer una prueba desde cero.'
    );
    if (!confirmacion) return;

    setReiniciando(true);
    setErr(null);
    setMensajeOk('');
    try {
      const res: any = await llamar('/api/viajes/reiniciar-demo', 'POST');
      setMensajeOk(res.mensaje || 'Demostración reiniciada con éxito.');
      setSoloConCarga(false); // Mostrar todos los turnos para que se vean los viajes recién creados (vacíos)
      await cargar();
    } catch (e: any) {
      setErr(e);
    } finally {
      setReiniciando(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Viajes y Manifiestos de Carga</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Turnos programados de la Cooperativa Unión Cariamanga entre Quito, Loja y Zumba</p>
        </div>

        {/* Botón de reinicio exclusivo para pruebas del MVP */}
        <button
          type="button"
          onClick={reiniciarTodo}
          disabled={reiniciando}
          style={{
            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
          title="Limpia encomiendas y deja los 6 buses de ruta listos para pruebas limpias"
        >
          <span>{reiniciando ? '⏳ Reiniciando...' : '🔄 Reiniciar Todo (Demo MVP)'}</span>
        </button>
      </div>

      <Error_ e={err} />

      {mensajeOk && (
        <div className="okmsg" style={{ marginBottom: 16 }}>
          ✓ {mensajeOk}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Listado de Turnos y Vehículos Asignados</h2>

          {/* Selector de filtro: Solo con encomiendas vs Todos */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: 4 }}>
            <button
              type="button"
              onClick={() => setSoloConCarga(true)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: soloConCarga ? '#ffffff' : 'transparent',
                color: soloConCarga ? '#1e3a8a' : '#64748b',
                boxShadow: soloConCarga ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              📦 Solo con Encomiendas ({viajesConCargaCount})
            </button>
            <button
              type="button"
              onClick={() => setSoloConCarga(false)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: !soloConCarga ? '#ffffff' : 'transparent',
                color: !soloConCarga ? '#1e3a8a' : '#64748b',
                boxShadow: !soloConCarga ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              🌐 Todos los Turnos ({v.length})
            </button>
          </div>
        </div>

        <div className="tabla-scroll">
          <table className="tabla-fija">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vehículo / Turno</th>
                <th>Ruta</th>
                <th>Tripulación Responsable</th>
                <th>Estado</th>
                <th>Parada actual</th>
                <th>Paquetes</th>
                <th>Escaneos QR</th>
                <th style={{ minWidth: 160 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {viajesFiltrados.map(x => {
                const paradaNum = x.parada_actual || 1;
                return (
                  <tr key={x.id}>
                    <td>{String(x.fecha).slice(0, 10)}</td>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={'/viajes/' + x.id}>{x.vehiculo}</Link>
                    </td>
                    <td>{x.ruta}</td>
                    <td>
                      {x.conductor || x.ayudante ? (
                        <div style={{ fontSize: '13px' }}>
                          <div><b>Chofer:</b> {x.conductor || '—'}</div>
                          {x.ayudante && <div style={{ color: '#64748b' }}><b>Ayudante:</b> {x.ayudante}</div>}
                        </div>
                      ) : (
                        <span className="muted">Sin asignar</span>
                      )}
                    </td>
                    <td>
                      <span className={'tag ' + (x.estado === 'cerrado' ? '' : x.estado === 'en_ruta' ? 'verde' : 'amarillo')}>
                        {x.estado}
                      </span>
                    </td>
                    <td>Parada #{paradaNum}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '2px 8px', borderRadius: 999, fontWeight: 700, fontSize: 12,
                        background: Number(x.items) > 0 ? '#eff6ff' : '#f1f5f9',
                        color: Number(x.items) > 0 ? '#1d4ed8' : '#64748b',
                      }}>
                        <b>{x.items}</b>&nbsp;paquete(s)
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${Number(x.escaneos) > 0 ? 'verde' : ''}`}>
                        {Number(x.escaneos)} verificados
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link
                          href={`/viajes/${x.id}/paradas/${paradaNum}?modo=carga`}
                          className="btn"
                          style={{ padding: '3px 8px', fontSize: '11.5px', background: '#2563eb', color: '#fff', border: 'none' }}
                          title="Subir paquetes a bordo en esta parada"
                        >
                          ⬆️ Subir Paquetes
                        </Link>
                        <Link
                          href={`/viajes/${x.id}/paradas/${paradaNum}#salida`}
                          className="btn"
                          style={{ padding: '3px 8px', fontSize: '11.5px', background: '#0f172a', color: '#fff', border: 'none' }}
                          title="Verificar carga y autorizar salida del bus"
                        >
                          🚀 Autorizar Salida
                        </Link>
                        <Link
                          className="btn sec"
                          style={{ padding: '3px 8px', fontSize: '11.5px' }}
                          href={'/viajes/' + x.id}
                        >
                          Trazabilidad ➔
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!viajesFiltrados.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                    {soloConCarga
                      ? 'No hay viajes con paquetes o encomiendas asignadas en este momento. Cambia a "Todos los Turnos" para ver los turnos vacíos.'
                      : 'No hay viajes registrados. Presiona "🔄 Reiniciar Todo (Demo MVP)" para generar los turnos estándar.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
