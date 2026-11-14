'use client';

import { useState } from 'react';
import Link from 'next/link';
import { llamar, fechaEC, fmtLegible } from '@/lib/cliente';
import { Error_, Estado, BotonAtras } from '@/components/ui';

export default function Entrega() {
  const [q, setQ] = useState('');
  const [e, setE] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [ok, setOk] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [f, setF] = useState({
    metodo: 'codigo',
    codigo: '',
    receptorNombre: '',
    receptorDoc: '',
    motivo: '',
    supEmail: '',
    supPass: '',
  });

  const buscar = async (valorCustom?: string) => {
    const termino = valorCustom ?? q;
    if (!termino.trim()) return;

    setErr(null);
    setOk('');
    setBuscando(true);

    try {
      const data: any = await llamar('/api/entregas/buscar?q=' + encodeURIComponent(termino.trim()));
      setE(data);
      setF(prev => ({
        ...prev,
        receptorNombre: prev.receptorNombre || data.dest_nombre || '',
        codigo: data.codigoIngresadoDirecto || (/^\d{6}$/.test(termino.trim()) ? termino.trim() : prev.codigo),
      }));
    } catch (x) {
      setErr(x);
      setE(null);
    } finally {
      setBuscando(false);
    }
  };

  const entregar = async () => {
    if (!e) return;
    setErr(null);
    setOk('');
    setGuardando(true);

    try {
      const r: any = await llamar('/api/entregas', 'POST', {
        encomiendaId: e.id,
        metodo: f.metodo,
        codigo: f.codigo || undefined,
        receptorNombre: f.receptorNombre,
        receptorDoc: f.receptorDoc || null,
        motivo: f.motivo || null,
        supervisor: f.supEmail ? { email: f.supEmail, password: f.supPass } : null,
      });

      const msg = r.parcial
        ? `✓ Entrega PARCIAL registrada (${r.bultosEntregados} bultos entregados). El resto sigue en custodia.`
        : `✓ Entrega registrada con ÉXITO (${r.bultosEntregados} paquete/s). Guía completada.`;

      setOk(msg);
      setE(null);
      setQ('');
      setF({ metodo: 'codigo', codigo: '', receptorNombre: '', receptorDoc: '', motivo: '', supEmail: '', supPass: '' });
    } catch (x) {
      setErr(x);
    } finally {
      setGuardando(false);
    }
  };

  const set = (k: string) => (ev: any) => setF({ ...f, [k]: ev.target.value });

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '16px 20px' }}>
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
              color: '#34d399',
              backgroundColor: 'rgba(52, 211, 153, 0.15)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            🤝 Mostrador de Entrega al Cliente
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 6px', color: '#ffffff' }}>
            Despacho y Retiro de Encomiendas
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Pide al cliente su código de 6 dígitos (enviado a su WhatsApp), número de encomienda o código de paquete.
          </p>
        </div>
      </div>

      <Error_ e={err} />
      {ok && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#15803d',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {ok}
        </div>
      )}

      {/* PASO 1: BÚSQUEDA RÁPIDA */}
      <div
        style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 16,
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(10,25,47,0.05)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
          1. Localizar Encomienda o Paquete
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>
          Ingresa cualquiera de los siguientes datos para traer el registro de inmediato:
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={ev => setQ(ev.target.value)}
            onKeyDown={ev => ev.key === 'Enter' && buscar()}
            placeholder="Código de 6 dígitos, ej: 947962  ó  Guía: E-J696WYWD..."
            style={{
              flex: '1 1 320px',
              padding: '12px 16px',
              borderRadius: 10,
              border: '2px solid #cbd5e1',
              fontSize: 15,
              fontWeight: 600,
            }}
          />
          <button
            type="button"
            disabled={buscando || !q.trim()}
            onClick={() => buscar()}
            style={{
              backgroundColor: '#1d4ed8',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 24px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {buscando ? 'Buscando...' : '🔍 Buscar Encomienda'}
          </button>
        </div>
      </div>

      {/* PASO 2: VERIFICACIÓN Y REGISTRO DE ENTREGA */}
      {e && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
          {/* DETALLES DE LO QUE SE ENTREGA */}
          <div
            style={{
              padding: 22,
              borderRadius: 16,
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Guía: {e.codigo}
              </h2>
              <Estado e={e.estado ?? 'en_proceso'} />
            </div>

            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              <div>Destinatario oficial: <b style={{ color: '#0f172a' }}>{e.dest_nombre}</b></div>
              <div>Agencia de entrega: <b>{e.destino}</b></div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Bultos que componen esta entrega:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {e.bultos.map((b: any) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Paquete #{b.numero}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1e3a8a' }}>
                      {fmtLegible(b.codigo_legible)}
                    </span>
                    <Estado e={b.estado} />
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 10,
                borderRadius: 8,
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                fontSize: 12,
                color: '#1e40af',
              }}
            >
              {e.codigoRetiro
                ? `🔑 Código de WhatsApp válido hasta ${fechaEC(e.codigoRetiro.expira_at)}. Intentos restantes: ${e.codigoRetiro.intentosRestantes}`
                : 'ℹ️ No se emitió código numérico (se puede entregar verificando documento de identidad).'}
            </div>
          </div>

          {/* FORMULARIO DE CONFIRMACIÓN */}
          <div
            style={{
              padding: 22,
              borderRadius: 16,
              backgroundColor: '#f8fafc',
              border: '2px solid #86efac',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 14px', color: '#15803d' }}>
              2. Confirmar Retiro y Entrega
            </h2>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Método de Verificación:</span>
              <select
                value={f.metodo}
                onChange={set('metodo')}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                  background: '#ffffff',
                }}
              >
                <option value="codigo">Código de Retiro WhatsApp (6 dígitos)</option>
                <option value="documento">Cédula / Documento de Identidad</option>
                <option value="tercero">Tercero Autorizado (con cédula)</option>
              </select>
            </label>

            {f.metodo === 'codigo' && (
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Código de 6 dígitos de WhatsApp:</span>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={f.codigo}
                  onChange={set('codigo')}
                  placeholder="Ej: 947962"
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '2px solid #3b82f6',
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                    textAlign: 'center',
                  }}
                />
              </label>
            )}

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Nombre de quien recibe:</span>
              <input
                value={f.receptorNombre}
                onChange={set('receptorNombre')}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                Cédula / Documento {f.metodo === 'codigo' ? '(opcional)' : '(obligatorio)'}:
              </span>
              <input
                value={f.receptorDoc}
                onChange={set('receptorDoc')}
                placeholder="1102345678"
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 14,
                }}
              />
            </label>

            <button
              type="button"
              disabled={guardando || !f.receptorNombre.trim() || (f.metodo === 'codigo' && !f.codigo)}
              onClick={entregar}
              style={{
                width: '100%',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
              }}
            >
              {guardando ? 'Registrando entrega...' : '✅ Entregar Paquete(s) al Cliente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
