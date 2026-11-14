import { z } from 'zod';
import { api } from '@/server/http';
import { pool, q } from '@/server/db';
import { clasificarPaquete } from '@/server/services/packageClassifier';

export const POST = api(
  {
    permiso: null, // Usuarios autenticados en ventanilla
    schema: z.object({
      imageDataUrl: z.string().min(50).max(4_000_000),
    }),
  },
  async ({ body }) => {
    const clasificacion = await clasificarPaquete(body.imageDataUrl);

    // Obtener las categorías activas de la base de datos
    const categorias = await q<any>(
      pool,
      'SELECT id, label, precio_cent, max_peso_g, orden FROM paquete_categoria WHERE activa = 1 ORDER BY orden'
    );

    const catSeleccionada = categorias.find((c: any) => c.id === clasificacion.categoriaId);

    return {
      ...clasificacion,
      precioCent: catSeleccionada?.precio_cent ?? 0,
      categorias,
    };
  }
);
