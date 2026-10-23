'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';

const PERFILES_INFO = [
  { clave: 'ventanilla1.', nombre: 'Operador Ventanilla', icono: '🏢', desc: 'Crea encomiendas, asigna viajes y entrega' },
  { clave: 'conductor1.', nombre: 'Conductor / Tripulación de Bus', icono: '🚍', desc: 'Escanea paquetes (subir/bajar) y autoriza salida' },
  { clave: 'gerencia1.', nombre: 'Gerencia General', icono: '📊', desc: 'Gestión de viajes y métricas globales' },
];

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<any>(null);
  const [cargando, setCargando] = useState(false);

  const ingresarConClave = async (claveAUsar?: string) => {
    const claveFinal = (claveAUsar || password).trim();
    if (!claveFinal) return;
    setErr(null);
    setCargando(true);
    try {
      const res: any = await llamar('/api/auth/login', 'POST', { password: claveFinal });
      // Guardar también en localStorage para consistencia del cliente
      localStorage.setItem('rol_usuario', res.rolId);
      router.push('/panel');
      router.refresh();
    } catch (e) {
      setErr(e);
    } finally {
      setCargando(false);
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: '40px auto 20px', padding: '0 16px' }}>
      <div className="card" style={{ padding: '32px 28px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, margin: '0 0 6px', color: '#132a52' }}>Software Trazabilidad de Encomiendas</h1>
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Panel de Operaciones · Iniciar Sesión
          </p>
        </div>

        <form onSubmit={e => { e.preventDefault(); ingresarConClave(); }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#334155' }}>
            Ingresa tu contraseña de perfil
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="Ej: ventanilla1."
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={cargando}
              style={{ flex: 1, padding: '10px 14px', fontSize: '15px' }}
              autoFocus
            />
            <button type="submit" disabled={cargando || !password.trim()} style={{ padding: '10px 20px', fontSize: '15px' }}>
              {cargando ? 'Entrando...' : 'Ingresar ➔'}
            </button>
          </div>
        </form>

        <Error_ e={err} />

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🔑 Contraseñas de acceso rápido (Toca una para probar):
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {PERFILES_INFO.map(p => (
              <button
                key={p.clave}
                type="button"
                onClick={() => {
                  setPassword(p.clave);
                  ingresarConClave(p.clave);
                }}
                disabled={cargando}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#cbd5e1')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{p.icono}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b' }}>{p.nombre}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{p.desc}</div>
                  </div>
                </div>
                <code style={{ background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                  {p.clave}
                </code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
