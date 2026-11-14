import { z } from 'zod';
import { api } from '@/server/http';
import { pool } from '@/server/db';
import { ErrorNegocio } from '@/server/comun';
import { puede } from '@/shared/permisos';
import { crearEncomienda, listarEncomiendas, listarEncomiendasPorViaje } from '@/server/services/encomienda';

export const GET = api({ permiso: null, schema: z.object({ q: z.string().optional(), grouped: z.enum(['true','false']).optional() }) },
  async ({ body }) => {
    if (body.grouped === 'true') return listarEncomiendasPorViaje(pool, body.q);
    return listarEncomiendas(pool, body.q);
  });

export const POST = api({ permiso: 'encomienda:crear', schema: z.object({
  origenId: z.string(), destinoId: z.string(),
  remitenteNombre: z.string().min(1).max(100), remitenteTel: z.string().max(20).nullish(),
  destNombre: z.string().min(1).max(100), destTel: z.string().max(20).nullish(),
  contenido: z.string().max(255).nullish(), valorDeclaradoCent: z.number().int().nonnegative().nullish(), refExterna: z.string().max(500).nullish(),
  viajeId: z.string().nullish(),
  bultos: z.array(z.object({
    pesoG: z.number().int().positive(),
    largoMm: z.number().int().positive().nullish(),
    anchoMm: z.number().int().positive().nullish(),
    altoMm: z.number().int().positive().nullish(),
    categoriaId: z.string().max(30).nullish(),
    fotoUrl: z.string().max(500).nullish(),
    iaClasificacion: z.any().nullish(),
  })).min(1).max(50),
  manual: z.object({ valorCent: z.number().int().nonnegative(), motivo: z.string() }).nullish(),
}) }, async ({ user, body }) => {
  if (!puede(user, 'encomienda:crear', body.origenId)) throw new ErrorNegocio('SIN_PERMISO', 'No puedes registrar encomiendas en esa agencia', undefined, 403);
  return crearEncomienda(user.id, body);
});

