// Motor de tarifa determinista. La tarifa la decide una tabla versionada, nunca un modelo. PURO.
export interface BultoMedidas { pesoG: number; largoMm?: number | null; anchoMm?: number | null; altoMm?: number | null }
export interface Regla { id: string; desdeG: number; hastaG: number; precioCent: number } // desde <= p < hasta
export interface ResultadoCotizacion {
  valorCent: number; sinRegla: boolean; pesoTotalG: number; pesoFactTotalG: number;
  detalle: { numero: number; pesoFactG: number; reglaId: string | null; precioCent: number }[];
}

/** Peso volumetrico en gramos: mm3 / (cm3 por kg) == gramos (enteros, redondeo hacia arriba). */
export function pesoVolumetricoG(largoMm: number, anchoMm: number, altoMm: number, factorCm3PorKg: number): number {
  const vol = largoMm * anchoMm * altoMm;
  return Math.floor((vol + factorCm3PorKg - 1) / factorCm3PorKg);
}
export function pesoFacturableG(b: BultoMedidas, factor: number): number {
  const { largoMm: l, anchoMm: a, altoMm: h } = b;
  if (l && a && h) return Math.max(b.pesoG, pesoVolumetricoG(l, a, h, factor));
  return b.pesoG;
}

/** Modo por defecto: precio por bulto, sumado. (Pendiente confirmar con la cooperativa: por bulto o por encomienda.) */
export function cotizar(bultos: BultoMedidas[], reglas: Regla[], factor: number): ResultadoCotizacion {
  let total = 0, sinRegla = false, pesoTotal = 0, pesoFactTotal = 0;
  const detalle: ResultadoCotizacion['detalle'] = [];
  bultos.forEach((b, idx) => {
    const pf = pesoFacturableG(b, factor);
    const r = reglas.find(x => pf >= x.desdeG && pf < x.hastaG) ?? null;
    if (!r) sinRegla = true; // NO se inventa tarifa
    total += r?.precioCent ?? 0;
    pesoTotal += b.pesoG; pesoFactTotal += pf;
    detalle.push({ numero: idx + 1, pesoFactG: pf, reglaId: r?.id ?? null, precioCent: r?.precioCent ?? 0 });
  });
  return { valorCent: sinRegla ? 0 : total, sinRegla, pesoTotalG: pesoTotal, pesoFactTotalG: pesoFactTotal, detalle };
}

export interface CategoriaPaqueteItem {
  id: string;
  label: string;
  precio_cent: number;
}

export function precioPorCategoria(categoriaId: string, categorias: CategoriaPaqueteItem[]): number | null {
  const cat = categorias.find(c => c.id === categoriaId);
  if (!cat || cat.id === 'personalizado') return null;
  return cat.precio_cent;
}

