import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface ClasificacionResultado {
  categoriaId: string;
  confianza: number;
  nota: string;
}

const CLASIFICACION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ['ENVELOPE', 'SMALL_BOX', 'MEDIUM_BOX', 'LARGE_BOX', 'IRREGULAR'],
      description: 'ENVELOPE = sobre/documento plano; SMALL_BOX = caja pequeña de mano; MEDIUM_BOX = caja mediana de encomienda; LARGE_BOX = caja grande o bulto voluminoso; IRREGULAR = bolsa, saco o forma amorfa.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Nivel de certeza entre 0.0 y 1.0',
    },
    note: {
      type: Type.STRING,
      description: 'Breve descripción en español del aspecto visual y dimensiones aproximadas estimadas.',
    },
  },
  required: ['category', 'confidence', 'note'],
};

export async function clasificarPaquete(imageDataUrl: string): Promise<ClasificacionResultado> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      categoriaId: 'personalizado',
      confianza: 0,
      nota: 'API key de Gemini no configurada; seleccione la categoría manualmente.',
    };
  }

  const match = /^data:(image\/(?:jpeg|webp|png|jpg));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
  if (!match) {
    return {
      categoriaId: 'personalizado',
      confianza: 0,
      nota: 'Formato de imagen inválido o no reconocido.',
    };
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const base64Data = match[2];

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: `Eres un asistente de recepción de paquetería y encomiendas en una cooperativa de transporte.
Observa la fotografía del paquete/bulto y clasifícalo en una de las categorías estándar:
- ENVELOPE: Sobre de manila, carta, documento, paquete plano (espesor < 3cm).
- SMALL_BOX: Cajón o caja pequeña (hasta aprox 30x25x20 cm).
- MEDIUM_BOX: Cartón o caja mediana estándar (hasta aprox 50x40x35 cm).
- LARGE_BOX: Cartón grande, caja voluminosa (hasta aprox 80x60x60 cm).
- IRREGULAR: Saco de lona, bulto envuelto, rollo o forma no prismática.

Indica tu nivel de confianza y una breve nota visual en español.`
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: CLASIFICACION_SCHEMA,
      },
    });

    if (!response.text) {
      return { categoriaId: 'personalizado', confianza: 0, nota: 'No se obtuvo respuesta de la IA' };
    }

    const parsed = JSON.parse(response.text) as { category: string; confidence: number; note: string };

    const mapa: Record<string, string> = {
      ENVELOPE: 'sobre',
      SMALL_BOX: 'cajon_pequeno',
      MEDIUM_BOX: 'carton_mediano',
      LARGE_BOX: 'carton_grande',
      IRREGULAR: 'personalizado',
    };

    const categoriaId = mapa[parsed.category] || 'personalizado';

    return {
      categoriaId,
      confianza: Number((parsed.confidence || 0.8).toFixed(2)),
      nota: parsed.note || 'Paquete analizado visualmente',
    };
  } catch (error: any) {
    console.error('Error al clasificar paquete con Gemini:', error);
    return {
      categoriaId: 'personalizado',
      confianza: 0,
      nota: 'No se pudo clasificar automáticamente; elija el tipo de forma manual.',
    };
  }
}
