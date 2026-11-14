'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { llamar, fmtLegible } from '@/lib/cliente';
import { Error_, Estado } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import OperacionViajeModal from '@/components/OperacionViajeModal';

export default function MiViaje() {
  const u = useUsuario();
  const [data, setData]  = useState<any>(null);
  const [err, setErr]    = useState<any>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'cargados' | 'entregados'>('todos');
  const [modalOperacion, setModalOperacion] = useState<{
    abierto: boolean;
    modo: 'carga' | 'descarga' | 'salida';
  }>({
    abierto: false,
    modo: 'carga',
  });

  const cargar = () => llamar('/api/mi-viaje').then(setData).catch(setErr);
  useEffect(() => { cargar(); }, []);

  if (!data && !err) return <div className="mi-viaje-loading">Cargando tu manifiesto...</div>;

  if (!data?.viaje) return (
    <div className="mi-viaje-sin-viaje">
      <div className="mi-viaje-sin-viaje-icon">🚌</div>
      <h2>Sin viaje activo</h2>
      <p>No tienes ningún manifiesto cerrado asignado a tu nombre en este momento.</p>
      <p className="muted" style={{ fontSize: 13 }}>
        Cuando el operador cierre el manifiesto y te asigne como chofer o ayudante,
        tu viaje aparecerá aquí.
      </p>
      <Link href="/viajes" className="btn sec" style={{ marginTop: 12 }}>Ver todos los viajes</Link>
    </div>
  );

  const { viaje, version, paradas, items, stats } = data;

  const nombreP = (o: number) => paradas.find((p: any) => p.orden === o)?.nombre ?? `Parada ${o}`;

  const itemsFiltrados = items.filter((it: any) => {
    if (filtro === 'pendientes') return it.estado === 'pendiente_despacho';
    if (filtro === 'cargados')   return ['cargado','en_transito'].includes(it.estado);
    if (filtro === 'entregados') return ['descargado','recibido_agencia','disponible_retiro','entregado'].includes(it.estado);
    return true;
  });

  const cerradoAt = viaje.manifiesto_cerrado_at
    ? new Date(viaje.manifiesto_cerrado_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div className="mi-viaje-wrap">
      <h1 style={{ marginBottom: 4 }}>Mi Viaje Activo</h1>
      <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
        Bienvenido, <b>{u.nombre}</b>. Este es tu manifiesto vigente.
      </p>
      <Error_ e={err} />

      {/* ── TARJETA PRINCIPAL DEL VIAJE ── */}
      <div className="mi-viaje-hero-card">
        <div className="mi-viaje-hero-top">
          <div>
            <div className="mi-viaje-hero-ruta">{viaje.ruta}</div>
            <div className="mi-viaje-hero-vehiculo">Bus: <b>{viaje.vehiculo}</b></div>
            <div className="mi-viaje-hero-fecha">
              {new Date(viaje.fecha).toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            {cerradoAt && (
              <div className="mi-viaje-hero-cierre">Manifiesto cerrado: {cerradoAt}</div>
            )}
          </div>
          <div className="mi-viaje-hero-estado">
            <span className={`tag ${viaje.estado === 'en_ruta' ? 'verde' : 'amarillo'}`}>
              {viaje.estado === 'en_ruta' ? 'En Ruta' : 'Listo para Salir'}
            </span>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              Manifiesto v{version}
            </div>
          </div>
        </div>

        {/* Parada actual */}
        <div className="mi-viaje-parada-actual">
          <span className="mi-viaje-parada-label">Parada actual:</span>
          <span className="mi-viaje-parada-nombre">{nombreP(viaje.parada_actual)}</span>
        </div>

        {/* Estadísticas */}
        <div className="mi-viaje-stats">
          <div className="mi-viaje-stat" onClick={() => setFiltro('todos')}>
            <div className="mi-viaje-stat-num">{stats.total}</div>
            <div className="mi-viaje-stat-label">Total paquetes</div>
          </div>
          <div className="mi-viaje-stat pendiente" onClick={() => setFiltro('pendientes')}>
            <div className="mi-viaje-stat-num">{stats.pendientes}</div>
            <div className="mi-viaje-stat-label">Por subir</div>
          </div>
          <div className="mi-viaje-stat cargado" onClick={() => setFiltro('cargados')}>
            <div className="mi-viaje-stat-num">{stats.cargados}</div>
            <div className="mi-viaje-stat-label">A bordo</div>
          </div>
          <div className="mi-viaje-stat entregado" onClick={() => setFiltro('entregados')}>
            <div className="mi-viaje-stat-num">{stats.entregados}</div>
            <div className="mi-viaje-stat-label">Entregados</div>
          </div>
        </div>
      </div>

      {/* Acceso rápido a parada actual con Asistente Modal */}
      {viaje.estado !== 'cerrado' && (
        <div style={{ margin: '14px 0', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={() => setModalOperacion({ abierto: true, modo: 'carga' })}
            className="btn verde"
            style={{
              padding: '14px',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
            }}
          >
            <span>⚡ Abrir Asistente — {nombreP(viaje.parada_actual)}</span>
          </button>

          <button
            type="button"
            onClick={() => setModalOperacion({ abierto: true, modo: 'salida' })}
            className="btn"
            style={{
              padding: '14px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 10,
              background: '#0f172a',
              color: '#ffffff',
            }}
          >
            🚀 Salida
          </button>
        </div>
      )}

      {/* ── LISTA DE PAQUETES ── */}
      <div className="card">
        <div className="mi-viaje-filtros">
          {(['todos','pendientes','cargados','entregados'] as const).map(f => (
            <button
              key={f}
              className={`mi-viaje-filtro-btn ${filtro === f ? 'activo' : ''}`}
              onClick={() => setFiltro(f)}
            >
              {f === 'todos' ? `Todos (${stats.total})` :
               f === 'pendientes' ? `Por subir (${stats.pendientes})` :
               f === 'cargados' ? `A bordo (${stats.cargados})` :
               `Entregados (${stats.entregados})`}
            </button>
          ))}
        </div>

        <div className="tabla-scroll">
          <table className="tabla-fija">
            <thead>
              <tr>
                <th>Código</th>
                <th>Encomienda</th>
                <th>Destinatario</th>
                <th>Sube en</th>
                <th>Baja en</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map((it: any) => (
                <tr key={it.bulto_id}>
                  <td className="mono">{fmtLegible(it.codigo_legible)}</td>
                  <td>{it.enc_codigo} #{it.numero}</td>
                  <td>{it.dest_nombre}</td>
                  <td>{nombreP(it.sube_orden)}</td>
                  <td>{nombreP(it.baja_orden)}</td>
                  <td><Estado e={it.estado} /></td>
                </tr>
              ))}
              {!itemsFiltrados.length && (
                <tr><td colSpan={6} className="muted">
                  {filtro === 'todos'
                    ? 'Sin paquetes en el manifiesto'
                    : `Sin paquetes en categoría "${filtro}"`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enlace al detalle completo del viaje */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Link href={`/viajes/${viaje.id}`} className="btn sec">
          Ver detalle completo del viaje
        </Link>
      </div>

      {/* ASISTENTE MODAL PARA OPERACIONES EN RUTA */}
      {modalOperacion.abierto && (
        <OperacionViajeModal
          viajeId={viaje.id}
          paradaInicial={viaje.parada_actual}
          modoInicial={modalOperacion.modo}
          abierto={modalOperacion.abierto}
          onCerrar={() => setModalOperacion((prev) => ({ ...prev, abierto: false }))}
          onActualizado={() => {
            cargar();
          }}
        />
      )}
    </div>
  );
}
