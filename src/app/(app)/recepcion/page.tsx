'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { llamar } from '@/lib/cliente';
import { Error_, ResultadoGrande, Scanner, BotonAtras } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';

export default function Recepcion() {
  const u = useUsuario();
  const [cat, setCat] = useState<any>(null);
  const [ag, setAg] = useState('');
  const [panelData, setPanelData] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [pasoActivo, setPasoActivo] = useState<'lista' | 'escanear'>('escanear');

  const cargarDatos = () => {
    llamar('/api/catalogos')
      .then((c: any) => {
        setCat(c);
        const miAgencia = u?.roles?.find((r: any) => r.agenciaId)?.agenciaId ?? c.agencias[0]?.id ?? '';
        setAg(miAgencia);
      })
      .catch(setErr);

    llamar('/api/panel')
      .then(setPanelData)
      .catch(console.warn);
  };

  useEffect(() => {
    cargarDatos();
  }, [u]);

  // Paquetes en tránsito que vienen hacia esta agencia
  const paquetesEnCamino = useMemo(() => {
    if (!panelData?.porRecibir) return [];
    return panelData.porRecibir.filter((b: any) => {
      if (!filtroTexto) return true;
      const t = filtroTexto.toLowerCase();
      return (
        b.codigo_legible?.toLowerCase().includes(t) ||
        b.enc_codigo?.toLowerCase().includes(t) ||
        b.agencia?.toLowerCase().includes(t)
      );
    });
  }, [panelData, filtroTexto]);

  const recibir = async (codigo: string) => {
    setErr(null);
    try {
      const r: any = await llamar('/api/recepciones', 'POST', { codigo, agenciaId: ag });
      const texto =
        r.resultado === 'repetido'
          ? { resultado: 'repetido', codigo: r.codigo, alerta: 'Este paquete ya había sido recibido en bodega previamente.' }
          : {
              resultado: 'ok',
              codigo: r.codigo,
              encomienda: r.encomienda,
              alerta:
                r.estado === 'pendiente_redespacho'
                  ? '⚠️ No es su destino final: queda PENDIENTE DE REDESPACHO con conexión a otro autobús.'
                  : '✅ Es su destino final: DISPONIBLE PARA RETIRO (se envió notificación al cliente).',
            };

      setRes(texto);
      setHist(h => [texto, ...h].slice(0, 8));

      // Actualizar listado de en camino
      llamar('/api/panel').then(setPanelData).catch(console.warn);
    } catch (e: any) {
      setErr(e);
      setRes(null);
    }
  };

  if (!cat) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#334155' }}>
          Cargando módulo de recepción...
        </div>
      </div>
    );
  }

  const agenciaActual = cat.agencias.find((a: any) => a.id === ag)?.nombre || 'Agencia';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px' }}>
      <BotonAtras href="/panel" label="Volver al Panel" />

      {/* CABECERA GUÍA */}
      <div
        style={{
          marginTop: 14,
          padding: '24px 28px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, #0a192f 0%, #0f2b48 100%)',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(10, 25, 47, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            📥 Descarga de Autobuses y Control de Bodega
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 6px', color: '#ffffff' }}>
            Recepción en Agencia ({agenciaActual})
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Escanea cada bulto al bajar del bus para ingresarlo a la bodega y habilitar el retiro del cliente.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', padding: '8px 14px', borderRadius: 12 }}>
          <label style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>Agencia Activa:</label>
          <select
            value={ag}
            onChange={e => setAg(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#0a192f',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {cat.agencias.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Error_ e={err} />

      {/* TABS DE MODO: ESCANEO ACTIVO VS LISTA EN CAMINO */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={() => setPasoActivo('escanear')}
          style={{
            flex: '1 1 200px',
            padding: '12px 18px',
            borderRadius: 12,
            border: pasoActivo === 'escanear' ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
            background: pasoActivo === 'escanear' ? '#eff6ff' : '#ffffff',
            fontWeight: 700,
            fontSize: 14,
            color: pasoActivo === 'escanear' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>🔫 Escáner y Recepción Rápida</span>
        </button>

        <button
          type="button"
          onClick={() => setPasoActivo('lista')}
          style={{
            flex: '1 1 200px',
            padding: '12px 18px',
            borderRadius: 12,
            border: pasoActivo === 'lista' ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
            background: pasoActivo === 'lista' ? '#eff6ff' : '#ffffff',
            fontWeight: 700,
            fontSize: 14,
            color: pasoActivo === 'lista' ? '#1d4ed8' : '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>📦 Paquetes por Recibir ({paquetesEnCamino.length})</span>
        </button>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div style={{ marginTop: 16 }}>
        {pasoActivo === 'escanear' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* ESCÁNER Y CONFIRMACIÓN */}
            <div style={{ padding: 24, borderRadius: 16, backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(10,25,47,0.05)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                Lector de Etiquetas / Código de Paquete
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
                Pase el código con la pistola lectora o escriba los 8 dígitos del paquete (ej. <code style={{ color: '#1d4ed8' }}>A9B2-C3D4</code>):
              </p>

              <Scanner onCode={recibir} />

              <div style={{ marginTop: 16 }}>
                <ResultadoGrande r={res} />
              </div>
            </div>

            {/* HISTORIAL RECIENTE */}
            <div style={{ padding: 24, borderRadius: 16, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                Últimos Bultos Procesados en este Turno
              </div>
              {hist.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Esperando el primer escaneo de la jornada...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hist.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1e3a8a', fontSize: 13 }}>
                          {item.codigo}
                        </span>
                        {item.encomienda && (
                          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                            ({item.encomienda})
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          backgroundColor: item.resultado === 'ok' ? '#dcfce7' : '#fef9c3',
                          color: item.resultado === 'ok' ? '#15803d' : '#854d0e',
                        }}
                      >
                        {item.resultado === 'ok' ? '✓ En Bodega' : 'Repetido'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TABLA DE PAQUETES POR RECIBIR EN CAMINO */
          <div style={{ padding: 24, borderRadius: 16, backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Bultos en Autobuses rumbo a {agenciaActual}
                </h2>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Total en tránsito: <b>{paquetesEnCamino.length}</b> paquete(s)
                </div>
              </div>

              <input
                type="text"
                value={filtroTexto}
                onChange={e => setFiltroTexto(e.target.value)}
                placeholder="Filtrar por código o encomienda..."
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  width: 260,
                }}
              />
            </div>

            <div className="tabla-scroll">
              <table className="tabla-fija">
                <thead>
                  <tr>
                    <th>Código Paquete</th>
                    <th>Guía / Encomienda</th>
                    <th>Origen</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paquetesEnCamino.map((b: any) => (
                    <tr key={b.id}>
                      <td className="mono" style={{ fontWeight: 800, color: '#1d4ed8' }}>
                        {b.codigo_legible}
                      </td>
                      <td style={{ fontWeight: 600 }}>{b.enc_codigo}</td>
                      <td style={{ color: '#475569' }}>{b.agencia}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            recibir(b.codigo_legible);
                            setPasoActivo('escanear');
                          }}
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 6,
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Recibir en Bodega
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paquetesEnCamino.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8' }}>
                        No hay paquetes pendientes de llegada para esta agencia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
