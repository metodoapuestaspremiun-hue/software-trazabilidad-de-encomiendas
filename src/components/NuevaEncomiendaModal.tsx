'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { llamar, dinero } from '@/lib/cliente';
import { Error_, Etiqueta } from '@/components/ui';

export interface CategoriaItem {
  id: string;
  label: string;
  precio_cent: number;
  max_peso_g?: number;
  orden?: number;
  icon?: string;
  desc?: string;
}

export interface BultoModal {
  tipo: string;
  fotoUrl: string;
  pesoKg: string;
  iaClasificacion?: any;
}

export interface NuevaEncomiendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogo: any;
  usuario: any;
  onSuccess?: (res: any) => void;
}

const CATEGORIAS_DEFECTO: CategoriaItem[] = [
  { id: 'sobre', label: 'Sobre / Documento', precio_cent: 250, icon: '📄', desc: 'Espesor plano < 3cm' },
  { id: 'cajon_pequeno', label: 'Cajón Pequeño', precio_cent: 400, icon: '📦', desc: 'Hasta ~30×25×20 cm' },
  { id: 'carton_mediano', label: 'Cartón Mediano', precio_cent: 750, icon: '📦', desc: 'Hasta ~50×40×35 cm' },
  { id: 'carton_grande', label: 'Cartón Grande', precio_cent: 1250, icon: '📦', desc: 'Hasta ~80×60×60 cm' },
  { id: 'personalizado', label: 'Personalizado', precio_cent: 0, icon: '⚙️', desc: 'Bulto irregular o especial' },
];

const bultoVacio = (): BultoModal => ({ tipo: 'carton_mediano', fotoUrl: '', pesoKg: '' });

const pesoDefectoGramos = (tipo: string): number => {
  switch (tipo) {
    case 'sobre': return 300;
    case 'cajon_pequeno': return 2500;
    case 'carton_mediano': return 6000;
    case 'carton_grande': return 16000;
    default: return 1000;
  }
};

export function NuevaEncomiendaModal({
  isOpen,
  onClose,
  catalogo,
  usuario,
  onSuccess,
}: NuevaEncomiendaModalProps) {
  const [paso, setPaso] = useState<number>(1);
  const [err, setErr] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // Datos de ruta y personas
  const [f, setF] = useState<any>({
    origenId: '',
    destinoId: '',
    viajeId: '',
    remitenteNombre: '',
    remitenteTel: '',
    destNombre: '',
    destTel: '',
    contenido: '',
    refExterna: '',
  });

  // Paquetes
  const [bultos, setBultos] = useState<BultoModal[]>([bultoVacio()]);
  const [manual, setManual] = useState({ valor: '', motivo: '' });

  // Estados de carga de cámara e IA
  const [subiendoFoto, setSubiendoFoto] = useState<number | null>(null);
  const [analizandoIA, setAnalizandoIA] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [indiceBultoFoto, setIndiceBultoFoto] = useState<number>(0);

  // Recuperar borrador si existe
  useEffect(() => {
    try {
      const savedF = localStorage.getItem('borrador_encomienda_modal_f');
      const savedB = localStorage.getItem('borrador_encomienda_modal_b');
      if (savedF) setF(JSON.parse(savedF));
      if (savedB) setBultos(JSON.parse(savedB));
    } catch {}
  }, []);

  // Guardar borrador reactivamente
  useEffect(() => {
    try {
      if (f.remitenteNombre || f.destNombre) {
        localStorage.setItem('borrador_encomienda_modal_f', JSON.stringify(f));
      }
      if (bultos.length > 0) {
        localStorage.setItem('borrador_encomienda_modal_b', JSON.stringify(bultos));
      }
    } catch {}
  }, [f, bultos]);

  // Cierre accesible por teclado ESC
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && isOpen) {
        if (!f.remitenteNombre || window.confirm('¿Desea cerrar el asistente? El borrador se mantendrá guardado.')) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, f.remitenteNombre, onClose]);

  // Inicializar agencias según sesión de usuario y catálogo
  useEffect(() => {
    if (!catalogo?.agencias?.length) return;
    const ags = catalogo.agencias;
    const mia = usuario?.roles?.find((r: any) => r.agenciaId)?.agenciaId ?? ags[0]?.id ?? '';
    const otra = ags.find((a: any) => a.id !== mia)?.id ?? ags[1]?.id ?? mia;

    setF((prev: any) => {
      const origen = prev.origenId || mia;
      const destino = prev.destinoId || otra;
      return {
        ...prev,
        origenId: origen,
        destinoId: destino,
      };
    });
  }, [catalogo, usuario]);

  // Lista de categorías con iconos enriquecidos
  const categorias: CategoriaItem[] = useMemo(() => {
    if (catalogo?.paquete_categorias?.length) {
      return catalogo.paquete_categorias.map((c: any) => {
        const fallback = CATEGORIAS_DEFECTO.find(f => f.id === c.id);
        return {
          ...c,
          icon: fallback?.icon || '📦',
          desc: fallback?.desc || '',
        };
      });
    }
    return CATEGORIAS_DEFECTO;
  }, [catalogo]);

  // Filtrado de viajes que cubran origen -> destino
  const viajesCompatibles = useMemo(() => {
    if (!catalogo?.viajes) return [];
    return (catalogo.viajes || []).filter((v: any) => {
      if (!f.origenId || !f.destinoId || f.origenId === f.destinoId) return true;
      const ruta = catalogo?.rutas?.find((r: any) => r.id === v.ruta_id);
      if (!ruta?.paradas) return true;
      const pOrigen = ruta.paradas.find((p: any) => p.agencia_id === f.origenId);
      const pDestino = ruta.paradas.find((p: any) => p.agencia_id === f.destinoId);
      return pOrigen && pDestino && pOrigen.orden < pDestino.orden;
    });
  }, [catalogo, f.origenId, f.destinoId]);

  // Auto-seleccionar primer viaje compatible si cambia ruta
  useEffect(() => {
    if (viajesCompatibles.length > 0 && !f.viajeId) {
      setF((prev: any) => ({ ...prev, viajeId: viajesCompatibles[0].id }));
    }
  }, [viajesCompatibles, f.viajeId]);

  // Manejo de cambio de ruta
  const cambiarRuta = (campo: 'origenId' | 'destinoId', valor: string) => {
    setF((prev: any) => ({
      ...prev,
      [campo]: valor,
      viajeId: '',
    }));
  };

  // Cálculo en tiempo real del valor total
  const { totalCents, hayPersonalizado, faltaPersonalizado } = useMemo(() => {
    let suma = 0;
    let tienePers = false;

    for (const b of bultos) {
      if (b.tipo === 'personalizado') {
        tienePers = true;
      } else {
        const cat = categorias.find(c => c.id === b.tipo);
        suma += cat ? cat.precio_cent : 0;
      }
    }

    const valorManualNum = manual.valor ? Math.round(parseFloat(manual.valor) * 100) : 0;
    const tieneManualIncompleto = tienePers && (!manual.valor || isNaN(valorManualNum) || valorManualNum <= 0 || !manual.motivo?.trim());

    if (tienePers && valorManualNum > 0) {
      suma += valorManualNum;
    }

    return { totalCents: suma, hayPersonalizado: tienePers, faltaPersonalizado: tieneManualIncompleto };
  }, [bultos, categorias, manual.valor, manual.motivo]);

  // Subida de imagen y análisis con IA
  const procesarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetIdx = indiceBultoFoto;
    setErr(null);
    setSubiendoFoto(targetIdx);

    try {
      // 1. Subida a almacenamiento CDN
      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefijo', `bulto-${targetIdx + 1}`);

      const resUpload = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const dataUpload = await resUpload.json();
      if (!resUpload.ok) throw new Error(dataUpload.error || 'Error al subir foto de evidencia');

      setBultos(prev => prev.map((b, i) => (i === targetIdx ? { ...b, fotoUrl: dataUpload.url } : b)));
      setSubiendoFoto(null);

      // 2. Clasificación automática (si Gemini responde una categoría válida distinta a personalizado)
      setAnalizandoIA(targetIdx);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const resIA: any = await llamar('/api/packages/classify', 'POST', { imageDataUrl: base64 });
          if (resIA?.categoriaId && resIA.categoriaId !== 'personalizado') {
            setBultos(prev =>
              prev.map((b, i) =>
                i === targetIdx
                  ? {
                      ...b,
                      tipo: resIA.categoriaId,
                      iaClasificacion: {
                        categoriaId: resIA.categoriaId,
                        confianza: resIA.confianza,
                        nota: resIA.nota,
                      },
                    }
                  : b
              )
            );
          }
        } catch (errorIA) {
          console.warn('Clasificación IA omitida:', errorIA);
        } finally {
          setAnalizandoIA(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      setErr(error);
      setSubiendoFoto(null);
      setAnalizandoIA(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Validaciones por paso
  const puedeAvanzarPaso1 = Boolean(f.origenId && f.destinoId && f.origenId !== f.destinoId);
  const puedeAvanzarPaso2 = Boolean(f.remitenteNombre?.trim() && f.destNombre?.trim());
  const puedeAvanzarPaso3 = bultos.every(b => Boolean(b.tipo && b.fotoUrl));

  // Envío final
  const guardar = async () => {
    setErr(null);
    setOcupado(true);
    try {
      const fotosTexto = bultos
        .map((b, i) => (b.fotoUrl ? `Bulto #${i + 1} (${b.tipo}): ${b.fotoUrl}` : null))
        .filter(Boolean)
        .join(' | ');

      const refFinal = f.refExterna
        ? (fotosTexto ? `${f.refExterna} [Fotos: ${fotosTexto}]` : f.refExterna)
        : (fotosTexto ? `[Fotos: ${fotosTexto}]` : null);

      const payloadBultos = bultos.map(b => {
        const pG = b.pesoKg && parseFloat(b.pesoKg) > 0
          ? Math.round(parseFloat(b.pesoKg) * 1000)
          : pesoDefectoGramos(b.tipo);
        return {
          pesoG: pG,
          categoriaId: b.tipo || 'carton_mediano',
          fotoUrl: b.fotoUrl || null,
          iaClasificacion: b.iaClasificacion || null,
        };
      });

      const res: any = await llamar('/api/encomiendas', 'POST', {
        origenId: f.origenId,
        destinoId: f.destinoId,
        remitenteNombre: f.remitenteNombre,
        remitenteTel: f.remitenteTel || null,
        destNombre: f.destNombre,
        destTel: f.destTel || null,
        contenido: f.contenido || null,
        refExterna: refFinal,
        viajeId: f.viajeId || null,
        bultos: payloadBultos,
        manual: hayPersonalizado && manual.valor
          ? { valorCent: Math.round(parseFloat(manual.valor) * 100), motivo: manual.motivo || 'Tarifa personalizada' }
          : null,
      });

      try {
        localStorage.removeItem('borrador_encomienda_modal_f');
        localStorage.removeItem('borrador_encomienda_modal_b');
      } catch {}

      setResultado(res);
      onSuccess?.(res);
    } catch (e: any) {
      setErr(e);
    } finally {
      setOcupado(false);
    }
  };

  if (!isOpen) return null;

  const origenNombre = catalogo?.agencias?.find((a: any) => a.id === f.origenId)?.nombre || 'Origen';
  const destinoNombre = catalogo?.agencias?.find((a: any) => a.id === f.destinoId)?.nombre || 'Destino';
  const viajeSeleccionado = catalogo?.viajes?.find((v: any) => v.id === f.viajeId);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(10, 25, 47, 0.72)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={procesarFoto}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '1060px',
          maxHeight: '94vh',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* CABECERA DEL MODAL */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #0a192f 0%, #0f2b48 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              📦
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
                Nueva Encomienda · Emisión Guiada
              </h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {resultado ? 'Guía registrada e imprimible' : `Paso ${paso} de 4 · Ventanilla Express`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!f.remitenteNombre || window.confirm('¿Desea cerrar el asistente? El borrador se mantendrá guardado.')) {
                onClose();
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
              borderRadius: 6,
            }}
            title="Cerrar ventana (Esc)"
          >
            ✕
          </button>
        </div>

        {/* INDICADOR DE PASOS (STEPPER) */}
        {!resultado && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}
          >
            {[
              { num: 1, label: 'Ruta y Bus', icon: '🚌' },
              { num: 2, label: 'Personas', icon: '👥' },
              { num: 3, label: 'Paquetes', icon: '📦' },
              { num: 4, label: 'Confirmar y QR', icon: '✅' },
            ].map(s => {
              const activo = paso === s.num;
              const completado = paso > s.num;
              return (
                <div
                  key={s.num}
                  onClick={() => {
                    if (completado) setPaso(s.num);
                  }}
                  style={{
                    padding: '12px 10px',
                    textAlign: 'center',
                    cursor: completado ? 'pointer' : 'default',
                    borderBottom: activo ? '3px solid #1d4ed8' : '3px solid transparent',
                    backgroundColor: activo ? '#ffffff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      backgroundColor: activo ? '#1d4ed8' : completado ? '#059669' : '#cbd5e1',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {completado ? '✓' : s.num}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: activo ? 700 : 500,
                      color: activo ? '#0f172a' : completado ? '#059669' : '#64748b',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* CUERPO PRINCIPAL DEL MODAL (SPLIT SCREEN: PASO ACTIVO + RESUMEN) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {resultado ? (
            /* VISTA DE ÉXITO FINAL */
            <div style={{ flex: 1, padding: 30, overflowY: 'auto', textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  fontSize: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                ✓
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
                ¡Encomienda Registrada Exitosamente!
              </h2>
              <div style={{ fontSize: 16, color: '#334155', marginBottom: 16 }}>
                Código oficial: <b style={{ color: '#1d4ed8', fontSize: 18 }}>{resultado.codigo}</b>
              </div>
              <div
                style={{
                  maxWidth: 480,
                  margin: '0 auto 24px',
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: 14,
                }}
              >
                Valor cotizado: <b>{dinero(resultado.valorCent)}</b> · {resultado.bultos.length} bulto(s)
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: '#0a192f',
                    color: '#ffffff',
                    padding: '12px 24px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  🖨️ Imprimir Etiquetas QR
                </button>
                <Link
                  href={`/encomiendas/${resultado.id}`}
                  style={{
                    backgroundColor: '#e2e8f0',
                    color: '#0f172a',
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Ver Ficha
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setResultado(null);
                    setPaso(1);
                    setBultos([bultoVacio()]);
                  }}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  + Nueva Encomienda
                </button>
              </div>

              <div className="etiquetas imprimible" style={{ maxWidth: 500, margin: '0 auto' }}>
                {resultado.bultos.map((b: any) => (
                  <Etiqueta
                    key={b.id}
                    token={b.qrToken}
                    legible={b.codigoLegible}
                    destino={destinoNombre}
                    numero={b.numero}
                    total={resultado.bultos.length}
                    encomienda={resultado.codigo}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ÁREA DE TRABAJO (PASO A PASO) */}
              <div style={{ flex: '1 1 65%', padding: '22px 28px', overflowY: 'auto' }}>
                <Error_ e={err} />

                {/* PASO 1: RUTA Y ASIGNACIÓN */}
                {paso === 1 && (
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>
                      Paso 1: Definir Ruta y Autobús de Carga
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                      <label style={{ display: 'block' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Agencia Origen *</span>
                        <select
                          value={f.origenId}
                          onChange={e => cambiarRuta('origenId', e.target.value)}
                          style={{
                            width: '100%',
                            marginTop: 6,
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            backgroundColor: '#fff',
                          }}
                        >
                          {catalogo?.agencias?.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.nombre}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: 'block' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Agencia Destino *</span>
                        <select
                          value={f.destinoId}
                          onChange={e => cambiarRuta('destinoId', e.target.value)}
                          style={{
                            width: '100%',
                            marginTop: 6,
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            backgroundColor: '#fff',
                          }}
                        >
                          {catalogo?.agencias?.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <label style={{ display: 'block' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                          🚌 Turno / Autobús Asignado (Manifiesto de Carga)
                        </span>
                        <select
                          value={f.viajeId || ''}
                          onChange={e => setF({ ...f, viajeId: e.target.value })}
                          style={{
                            width: '100%',
                            marginTop: 6,
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #cbd5e1',
                            fontSize: 14,
                            backgroundColor: '#fff',
                          }}
                        >
                          <option value="">-- Dejar en Bodega (Sin viaje inmediato) --</option>
                          {viajesCompatibles.map((v: any) => (
                            <option key={v.id} value={v.id}>
                              ⭐ {v.vehiculo} · {v.ruta_nombre} {v.conductor ? `(${v.conductor})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                        💡 Se filtran y pre-seleccionan solo los autobuses activos que cubren el trayecto desde {origenNombre} hacia {destinoNombre}.
                      </p>
                    </div>
                  </div>
                )}

                {/* PASO 2: PERSONAS */}
                {paso === 2 && (
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>
                      Paso 2: Datos de Remitente y Destinatario
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                      {/* Remitente */}
                      <div style={{ padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                          📤 Remitente (Quien Envía)
                        </div>
                        <label style={{ display: 'block', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Nombre completo *</span>
                          <input
                            type="text"
                            value={f.remitenteNombre}
                            onChange={e => setF({ ...f, remitenteNombre: e.target.value })}
                            placeholder="Ej. Juan Carlos Pérez"
                            style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <label style={{ display: 'block' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Teléfono celular</span>
                          <input
                            type="text"
                            value={f.remitenteTel}
                            onChange={e => setF({ ...f, remitenteTel: e.target.value })}
                            placeholder="0991234567"
                            style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                      </div>

                      {/* Destinatario */}
                      <div style={{ padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                          📥 Destinatario (Quien Retira)
                        </div>
                        <label style={{ display: 'block', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Nombre completo *</span>
                          <input
                            type="text"
                            value={f.destNombre}
                            onChange={e => setF({ ...f, destNombre: e.target.value })}
                            placeholder="Ej. María Elena López"
                            style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                        <label style={{ display: 'block' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>WhatsApp (código de retiro)</span>
                          <input
                            type="text"
                            value={f.destTel}
                            onChange={e => setF({ ...f, destTel: e.target.value })}
                            placeholder="0991234567"
                            style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                          />
                        </label>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                      <label style={{ display: 'block' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Contenido declarado</span>
                        <input
                          type="text"
                          value={f.contenido}
                          onChange={e => setF({ ...f, contenido: e.target.value })}
                          placeholder="Ej. Repuestos, ropa, documentos..."
                          style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                      </label>
                      <label style={{ display: 'block' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Referencia o Guía manual</span>
                        <input
                          type="text"
                          value={f.refExterna}
                          onChange={e => setF({ ...f, refExterna: e.target.value })}
                          placeholder="Ej. Guía papel #12345"
                          style={{ width: '100%', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* PASO 3: PAQUETES CON FOTO Y CATEGORÍA RÁPIDA */}
                {paso === 3 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                          Paso 3: Foto de Evidencia y Tipo de Paquete
                        </h3>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Tome la foto con el teléfono/cámara y Gemini Flash sugerirá el tamaño adecuado.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBultos([...bultos, bultoVacio()])}
                        style={{
                          backgroundColor: '#0a192f',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 2px 6px rgba(10, 25, 47, 0.2)',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>+</span> Añadir Bulto Extra
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {bultos.map((b, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: 16,
                            borderRadius: 14,
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#f8fafc',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                              📦 Paquete #{idx + 1}
                            </span>
                            {bultos.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setBultos(bultos.filter((_, i) => i !== idx))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#dc2626',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Quitar paquete
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'start' }}>
                            {/* Captura de Foto */}
                            <div>
                              {b.fotoUrl ? (
                                <div style={{ textAlign: 'center' }}>
                                  <img
                                    src={b.fotoUrl}
                                    alt="Foto paquete"
                                    style={{
                                      width: '100%',
                                      height: 120,
                                      objectFit: 'cover',
                                      borderRadius: 10,
                                      border: '1px solid #cbd5e1',
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIndiceBultoFoto(idx);
                                      fileInputRef.current?.click();
                                    }}
                                    style={{
                                      marginTop: 6,
                                      background: '#ffffff',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: 6,
                                      padding: '4px 8px',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                      width: '100%',
                                    }}
                                  >
                                    Cambiar foto
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={subiendoFoto === idx || analizandoIA === idx}
                                  onClick={() => {
                                    setIndiceBultoFoto(idx);
                                    fileInputRef.current?.click();
                                  }}
                                  style={{
                                    width: '100%',
                                    height: 120,
                                    borderRadius: 12,
                                    border: '2px dashed #38bdf8',
                                    backgroundColor: '#f0f9ff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    gap: 6,
                                    padding: 8,
                                  }}
                                >
                                  {subiendoFoto === idx ? (
                                    <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>Subiendo foto...</span>
                                  ) : analizandoIA === idx ? (
                                    <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>Gemini analizando tamaño...</span>
                                  ) : (
                                    <>
                                      <span style={{ fontSize: 24 }}>📸</span>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>Tomar Foto *</span>
                                      <span style={{ fontSize: 10, color: '#64748b' }}>Evidencia obligatoria</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Selector de Tamaño */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                Tamaño / Tarifa asignada:
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                                {categorias.map(c => {
                                  const sel = b.tipo === c.id;
                                  return (
                                    <div
                                      key={c.id}
                                      onClick={() => {
                                        setBultos(prev =>
                                          prev.map((it, i) => (i === idx ? { ...it, tipo: c.id } : it))
                                        );
                                      }}
                                      style={{
                                        padding: '8px 6px',
                                        borderRadius: 8,
                                        border: sel ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                        backgroundColor: sel ? '#f0fdf4' : '#ffffff',
                                        cursor: 'pointer',
                                        textAlign: 'center',
                                        boxShadow: sel ? '0 1px 3px rgba(22,163,74,0.2)' : 'none',
                                      }}
                                    >
                                      <div style={{ fontSize: 14 }}>{c.icon}</div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                                        {c.label}
                                      </div>
                                      <div style={{ fontSize: 11, fontWeight: 800, color: sel ? '#15803d' : '#64748b' }}>
                                        {c.id === 'personalizado' ? 'Manual' : dinero(c.precio_cent)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                <label style={{ fontSize: 11, color: '#64748b' }}>
                                  Peso báscula (opcional):
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={b.pesoKg}
                                    onChange={e => {
                                      const v = e.target.value;
                                      setBultos(prev =>
                                        prev.map((it, i) => (i === idx ? { ...it, pesoKg: v } : it))
                                      );
                                    }}
                                    placeholder="Ej. 4.5 kg"
                                    style={{
                                      marginLeft: 6,
                                      padding: '2px 6px',
                                      borderRadius: 6,
                                      border: '1px solid #cbd5e1',
                                      width: 80,
                                      fontSize: 11,
                                    }}
                                  />
                                </label>
                                {b.tipo && b.tipo !== 'personalizado' && (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d', backgroundColor: '#f0fdf4', padding: '2px 8px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                                    Subtotal: {dinero(categorias.find(c => c.id === b.tipo)?.precio_cent || 0)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* TARJETA DE VALOR COTIZADO INMEDIATO EN PASO 3 */}
                    <div
                      style={{
                        marginTop: 20,
                        padding: '16px 20px',
                        borderRadius: 14,
                        backgroundColor: '#f0fdf4',
                        border: '1.5px solid #86efac',
                        boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#166534', letterSpacing: '0.04em' }}>
                            💰 Valor Cotizado Calculado en Tiempo Real
                          </div>
                          <div style={{ fontSize: 13, color: '#15803d', marginTop: 2 }}>
                            {bultos.length} paquete(s) clasificado(s) según tamaño y evidencia fotográfica
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: '#166534', fontWeight: 600, display: 'block' }}>Total Estimado</span>
                          <span style={{ fontSize: 26, fontWeight: 800, color: '#15803d' }}>
                            {dinero(totalCents)}
                          </span>
                        </div>
                      </div>

                      {hayPersonalizado && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 10,
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fde68a',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
                            ⚙️ Un paquete tiene tarifa personalizada. Define el monto acordado aquí:
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Monto $"
                              value={manual.valor}
                              onChange={e => setManual({ ...manual, valor: e.target.value })}
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                            />
                            <input
                              type="text"
                              placeholder="Motivo / Justificación de la tarifa"
                              value={manual.motivo}
                              onChange={e => setManual({ ...manual, motivo: e.target.value })}
                              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PASO 4: REVISIÓN Y CONFIRMACIÓN */}
                {paso === 4 && (
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>
                      Paso 4: Confirmación Final y Emisión
                    </h3>

                    {/* TARJETA RESUMEN DESTACADA */}
                    <div
                      style={{
                        padding: '20px 24px',
                        borderRadius: 16,
                        backgroundColor: '#f0fdf4',
                        border: '2px solid #22c55e',
                        marginBottom: 20,
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.12)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#166534', fontWeight: 700, letterSpacing: '0.04em' }}>
                            Monto Total Confirmado:
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 900, color: '#15803d', marginTop: 2 }}>
                            {dinero(totalCents)}
                          </div>
                          <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>
                            {origenNombre} ➔ {destinoNombre} · {viajeSeleccionado?.vehiculo ? `Bus ${viajeSeleccionado.vehiculo}` : 'Bodega'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              padding: '6px 14px',
                              borderRadius: 20,
                              fontWeight: 700,
                              fontSize: 13,
                              display: 'inline-block',
                            }}
                          >
                            ✓ Listo para Emitir
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* DESGLOSE RÁPIDO DE BULTOS */}
                    <div style={{ padding: 14, borderRadius: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>
                        Detalle de Paquetes ({bultos.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {bultos.map((b, i) => {
                          const catItem = categorias.find(c => c.id === b.tipo);
                          const pCent = b.tipo === 'personalizado' ? Math.round(parseFloat(manual.valor || '0') * 100) : (catItem?.precio_cent || 0);
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0', borderBottom: i < bultos.length - 1 ? '1px dashed #cbd5e1' : 'none' }}>
                              <span style={{ color: '#1e293b' }}>
                                <b>Paquete #{i + 1}:</b> {catItem?.label || b.tipo} {b.fotoUrl ? '📸 (Foto verificada)' : ''}
                              </span>
                              <span style={{ fontWeight: 800, color: '#0f172a' }}>
                                {dinero(pCent)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ALERTA O CAMPO SI FALTA DEFINIR TARIFA PERSONALIZADA */}
                    {hayPersonalizado && (
                      <div
                        style={{
                          marginBottom: 20,
                          padding: '14px 18px',
                          borderRadius: 12,
                          backgroundColor: faltaPersonalizado ? '#fef2f2' : '#f0fdf4',
                          border: faltaPersonalizado ? '1.5px solid #f87171' : '1.5px solid #86efac',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: faltaPersonalizado ? '#991b1b' : '#166534', marginBottom: 6 }}>
                          {faltaPersonalizado
                            ? '⚠️ Requiere Tarifa Manual: Has seleccionado paquete "Personalizado". Ingresa el monto y motivo para emitir:'
                            : '✓ Tarifa personalizada configurada:'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>
                              Monto ($) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Ej: 5.00"
                              value={manual.valor}
                              onChange={e => setManual({ ...manual, valor: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 2 }}>
                              Motivo / Justificación *
                            </label>
                            <input
                              type="text"
                              placeholder="Ej: Dimensiones especiales / Bicicleta / Frágil"
                              value={manual.motivo}
                              onChange={e => setManual({ ...manual, motivo: e.target.value })}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                      Al hacer clic en <b>Confirmar y Emitir Guía</b>, el sistema registrará la encomienda, generará los códigos QR de rastreo y abrirá la ventana de impresión térmica.
                    </div>
                  </div>
                )}
              </div>

              {/* PANEL LATERAL DERECHO (TICKET EN VIVO) */}
              <div
                style={{
                  flex: '1 1 35%',
                  backgroundColor: '#f8fafc',
                  borderLeft: '1px solid #e2e8f0',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>
                    📋 Resumen en Vivo
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Ruta:</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {origenNombre} → {destinoNombre}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Bus:</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {viajeSeleccionado?.vehiculo ? `Bus ${viajeSeleccionado.vehiculo}` : 'En Bodega'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Remitente:</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {f.remitenteNombre || '—'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Destinatario:</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {f.destNombre || '—'}
                      </span>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '14px 0' }} />

                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                    Paquetes ({bultos.length}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                    {bultos.map((b, i) => {
                      const c = categorias.find(cat => cat.id === b.tipo);
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#334155' }}>
                            #{i + 1} {c?.label || b.tipo} {b.fotoUrl ? '📸' : '⚠️ Sin foto'}
                          </span>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>
                            {c?.id === 'personalizado' ? 'Manual' : dinero(c?.precio_cent || 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Total a cobrar:</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{dinero(totalCents)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* PIE DEL MODAL (BOTONES DE ACCIÓN) */}
        {!resultado && (
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            {paso > 1 ? (
              <button
                type="button"
                onClick={() => setPaso(p => p - 1)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                ← Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!f.remitenteNombre || window.confirm('¿Desea cerrar el asistente? El borrador se mantendrá guardado.')) {
                    onClose();
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {paso < 4 ? (
                <button
                  type="button"
                  disabled={
                    (paso === 1 && !puedeAvanzarPaso1) ||
                    (paso === 2 && !puedeAvanzarPaso2) ||
                    (paso === 3 && !puedeAvanzarPaso3)
                  }
                  onClick={() => setPaso(p => p + 1)}
                  style={{
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity:
                      (paso === 1 && !puedeAvanzarPaso1) ||
                      (paso === 2 && !puedeAvanzarPaso2) ||
                      (paso === 3 && !puedeAvanzarPaso3)
                        ? 0.5
                        : 1,
                  }}
                >
                  Continuar al Paso {paso + 1} →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado || faltaPersonalizado}
                  onClick={guardar}
                  style={{
                    backgroundColor: ocupado || faltaPersonalizado ? '#94a3b8' : '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 24px',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: ocupado || faltaPersonalizado ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: ocupado || faltaPersonalizado ? 'none' : '0 2px 8px rgba(5, 150, 105, 0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {ocupado
                    ? 'Emitiendo Guía...'
                    : faltaPersonalizado
                    ? '⚠️ Ingresa Motivo Personalizado'
                    : `✅ Emitir Encomienda (${dinero(totalCents)})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
