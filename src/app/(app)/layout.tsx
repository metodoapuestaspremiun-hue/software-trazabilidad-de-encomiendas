'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SesionCtx } from '@/components/Sesion';
import { puede, type SesionUsuario, type Rol } from '@/shared/permisos';

interface RolInfo {
  id: string;
  titulo: string;
  subtitulo: string;
  icono: string;
  roles: { rol: Rol; agenciaId: string | null }[];
  rutasPermitidas: { href: string; label: string; permiso?: string }[];
}

// Roles simplificados de la cooperativa
const ROLES: RolInfo[] = [
  {
    id: 'operador',
    titulo: 'Operador Ventanilla',
    subtitulo: 'Crea encomiendas, asigna viaje y entrega',
    icono: '🏢',
    roles: [{ rol: 'operador', agenciaId: null }, { rol: 'despachador', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/encomiendas/nueva', label: '+ Nueva encomienda', permiso: 'encomienda:crear' },
      { href: '/encomiendas', label: 'Encomiendas' },
      { href: '/viajes', label: 'Viajes' },
      { href: '/recepcion', label: 'Recepción', permiso: 'recepcion:confirmar' },
      { href: '/redespachos', label: 'Redespachos' },
      { href: '/entrega', label: 'Entrega a Cliente', permiso: 'entrega:crear' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'ayudante',
    titulo: 'Conductor / Tripulación de Bus',
    subtitulo: 'Escaneo de paquetes y autorización de salidas',
    icono: '🚍',
    roles: [
      { rol: 'guardia', agenciaId: null },
      { rol: 'ayudante', agenciaId: null },
      { rol: 'responsable_agencia', agenciaId: null },
      { rol: 'supervisor', agenciaId: null },
    ],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/viajes', label: 'Viajes, Escaneo y Salidas' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'guardia',
    titulo: 'Conductor / Tripulación de Bus',
    subtitulo: 'Escaneo de paquetes y autorización de salidas',
    icono: '🚍',
    roles: [
      { rol: 'guardia', agenciaId: null },
      { rol: 'ayudante', agenciaId: null },
      { rol: 'responsable_agencia', agenciaId: null },
      { rol: 'supervisor', agenciaId: null },
    ],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/viajes', label: 'Viajes, Escaneo y Salidas' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'gerente',
    titulo: 'Gerencia General',
    subtitulo: 'Gestión de viajes y métricas globales',
    icono: '📊',
    roles: [{ rol: 'gerente', agenciaId: null }, { rol: 'admin', agenciaId: null }, { rol: 'supervisor', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel Ejecutivo' },
      { href: '/viajes', label: 'Gestión de Viajes' },
      { href: '/encomiendas', label: 'Historial Encomiendas' },
      { href: '/tarifas', label: 'Tarifas y Precios' },
      { href: '/mensajes', label: 'Mensajes WhatsApp', permiso: 'ver:mensajes' },
      { href: '/incidencias', label: 'Auditoría Incidencias' },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [rolActualId, setRolActualId] = useState<string>('operador');
  const [menuMovilAbierto, setMenuMovilAbierto] = useState<boolean>(false);

  useEffect(() => {
    const rolGuardado = localStorage.getItem('rol_usuario');
    const cookiesArr = document.cookie.split('; ');
    const rolCookie = cookiesArr.find(row => row.startsWith('demo_rol='))?.split('=')[1];
    const rolFinal = rolGuardado || rolCookie;
    if (rolFinal && ROLES.some(r => r.id === rolFinal)) {
      setRolActualId(rolFinal);
    }
  }, []);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [pathname]);

  const configRol = ROLES.find(r => r.id === rolActualId) || ROLES[0];

  const sesionActiva: SesionUsuario = {
    id: `mvp-${configRol.id}`,
    nombre: configRol.titulo,
    email: `${configRol.id}@cariamanga.com`,
    roles: configRol.roles,
  };

  const enlacesDisponibles = configRol.rutasPermitidas.filter(
    link => !link.permiso || puede(sesionActiva, link.permiso)
  );

  return (
    <SesionCtx.Provider value={sesionActiva}>
      <div className="demo-wrapper">
        {/* BACKDROP CON DESENFOQUE PARA EL DRAWER LATERAL */}
        {menuMovilAbierto && (
          <div
            className="glass-drawer-backdrop noprint"
            onClick={() => setMenuMovilAbierto(false)}
            aria-label="Cerrar menú lateral"
          />
        )}

        {/* DRAWER LATERAL IZQUIERDO ULTRA GLASS */}
        <aside className={`glass-drawer-left noprint ${menuMovilAbierto ? 'abierto' : ''}`}>
          <div className="glass-drawer-header">
            <div className="glass-drawer-brand">
              <div>
                <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>Software Trazabilidad de Encomiendas</h3>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Panel Operativo</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuMovilAbierto(false)}
              className="btn-cerrar-drawer"
              title="Cerrar menú"
            >
              ✕
            </button>
          </div>

          {/* Información del Perfil Conectado en el Drawer */}
          <div className="glass-drawer-user-card">
            <span style={{ fontSize: '22px' }}>{configRol.icono}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {configRol.titulo}
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                {configRol.subtitulo}
              </div>
            </div>
          </div>

          {/* Enlaces de navegación vertical Glassmorphism */}
          <div className="glass-drawer-nav">
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#64748b', padding: '8px 12px 4px' }}>
              Módulos Disponibles
            </div>
            {enlacesDisponibles.map(link => {
              const activo = pathname === link.href || (link.href !== '/panel' && pathname.startsWith(link.href));
              return (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className={`glass-nav-item ${activo ? 'activo' : ''}`}
                  onClick={() => setMenuMovilAbierto(false)}
                >
                  <span className="glass-nav-bullet" />
                  <span style={{ flex: 1 }}>{link.label}</span>
                  {activo && <span className="glass-nav-indicator">●</span>}
                </Link>
              );
            })}
          </div>

          {/* Pie del Drawer con botón de Salir */}
          <div className="glass-drawer-footer">
            <button
              type="button"
              onClick={() => {
                document.cookie = 'demo_rol=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                localStorage.removeItem('rol_usuario');
                window.location.href = '/login';
              }}
              className="glass-btn-logout"
            >
              <span>🚪</span>
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL: Header superior Glass + Páginas */}
        <div className="demo-content-area" style={{ width: '100%', margin: 0 }}>
          <nav className="top-header noprint">
            {/* Botón Volver Atrás siempre visible si no está en la raíz del panel */}
            {pathname !== '/panel' && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    router.back();
                  } else {
                    router.push('/panel');
                  }
                }}
                className="btn-header-atras"
                aria-label="Volver a la pantalla anterior"
                title="Volver atrás"
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>←</span>
                <span className="btn-header-atras-texto">Atrás</span>
              </button>
            )}

            {/* Botón hamburguesa que abre el drawer lateral izquierdo */}
            <button
              type="button"
              onClick={() => setMenuMovilAbierto(true)}
              className="btn-hamburguesa-movil"
              aria-label="Abrir menú de navegación"
              title="Abrir menú"
            >
              ☰
            </button>

            <span className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span className="brand-texto">Software Trazabilidad de Encomiendas</span>
            </span>

            <span className="header-spacer" />

            {/* Chip del rol autenticado */}
            <div className="role-indicator-chip" title="Perfil activo de la sesión">
              <b>{configRol.icono} <span className="role-chip-name">{configRol.titulo}</span></b>
            </div>

            {/* Botón Salir / Cerrar Sesión */}
            <button
              type="button"
              onClick={() => {
                document.cookie = 'demo_rol=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                localStorage.removeItem('rol_usuario');
                window.location.href = '/login';
              }}
              className="btn-header-salir"
              title="Cerrar sesión e ir a login"
            >
              <span>🚪</span>
              <span className="btn-perfiles-texto">Salir</span>
            </button>
          </nav>

          <main>{children}</main>
        </div>
      </div>
    </SesionCtx.Provider>
  );
}
