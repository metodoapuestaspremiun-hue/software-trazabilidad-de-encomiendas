'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { llamar } from '@/lib/cliente';
import { Error_, BotonAtras } from '@/components/ui';
import { useUsuario } from '@/components/Sesion';
import { NuevaEncomiendaModal } from '@/components/NuevaEncomiendaModal';

export default function NuevaEncomiendaPage() {
  const usuario = useUsuario();
  const [catalogo, setCatalogo] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [modalAbierto, setModalAbierto] = useState<boolean>(true); // Abre modal de bienvenida guiado de inmediato

  useEffect(() => {
    llamar('/api/catalogos')
      .then(c => setCatalogo(c))
      .catch(e => {
        console.error('Error cargando catálogos:', e);
        setErr(e);
      });
  }, []);

  if (!catalogo) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#334155' }}>
          Cargando catálogo y rutas activas...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px 16px' }}>
      <BotonAtras href="/panel" label="Volver al Panel" />

      <Error_ e={err} />

      {/* Tarjeta de bienvenida y acceso directo al flujo guiado */}
      <div
        style={{
          marginTop: 16,
          padding: '28px 32px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, #0a192f 0%, #0f2b48 100%)',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(10, 25, 47, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            ⚡ Módulo de Ventanilla Rápida
          </span>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '12px 0 6px', color: '#ffffff' }}>
            Registro de Nueva Encomienda
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', maxWidth: 540 }}>
            Flujo guiado en ventana emergente (popup) paso a paso: selección de ruta, datos de contacto,
            clasificación visual instantánea con IA y emisión con etiqueta QR.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          style={{
            backgroundColor: '#059669',
            color: '#ffffff',
            border: 'none',
            borderRadius: 14,
            padding: '16px 28px',
            fontSize: 16,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'transform 0.15s ease',
          }}
        >
          <span>🚀 Abrir Asistente de Registro</span>
        </button>
      </div>

      {/* Enlaces y opciones rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
        <div style={{ padding: 20, borderRadius: 14, backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            🖨️ Re-impresión de Etiquetas
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Si necesitas reimprimir etiquetas de una encomienda ya registrada anteriormente.
          </p>
          <Link href="/encomiendas" style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
            Ir a lista de encomiendas →
          </Link>
        </div>

        <div style={{ padding: 20, borderRadius: 14, backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            🚌 Despacho a Bodega de Buses
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Verifica los bultos registrados pendientes de subir al autobús.
          </p>
          <Link href="/despacho" style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
            Ir a Despacho y Manifiestos →
          </Link>
        </div>
      </div>

      {/* POPUP MODAL GUIADO ACTIVO */}
      <NuevaEncomiendaModal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        catalogo={catalogo}
        usuario={usuario}
      />
    </div>
  );
}
