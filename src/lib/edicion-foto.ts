/**
 * Edición de fotos dentro del hub.
 *
 * Todo se hace en el navegador, sobre un `<canvas>`: la foto se dibuja, se
 * recorta, se gira y se filtra, y el resultado sale como PNG. No hay servidor
 * de imágenes, no hay Sharp, no hay nada que instalar.
 *
 * Lo importante de este módulo es que la edición NO inventa una foto: los
 * recortes salen de las medidas reales de la imagen y los filtros son los que
 * dice el canvas. Un recorte que se sale de la foto no es un recorte, es una
 * banda negra, y por eso `recorteParaProporcion` nunca devuelve un rectángulo
 * más grande que la imagen.
 *
 * El video NO se edita aquí: va como «Próximamente». Un bucket de solo
 * imágenes no puede guardar el video final, así que prometer edición de video
 * sería prometer una entrega que el hub no puede hacer.
 */

export type Proporcion = 'libre' | '1:1' | '4:5' | '9:16' | '16:9';

export const PROPORCIONES: readonly { id: Proporcion; etiqueta: string; valor: number | null }[] = [
  { id: 'libre', etiqueta: 'Libre', valor: null },
  { id: '1:1', etiqueta: '1:1', valor: 1 },
  { id: '4:5', etiqueta: '4:5 (feed)', valor: 4 / 5 },
  { id: '9:16', etiqueta: '9:16 (historia)', valor: 9 / 16 },
  { id: '16:9', etiqueta: '16:9 (horizontal)', valor: 16 / 9 },
];

/** La razón de aspecto de una proporción, o null si es libre. */
export function valorDeProporcion(proporcion: Proporcion): number | null {
  return PROPORCIONES.find((p) => p.id === proporcion)?.valor ?? null;
}

export type Recorte = {
  x: number;
  y: number;
  ancho: number;
  alto: number;
};

/**
 * El recorte CENTRADO más grande con esa proporción que cabe en la imagen.
 *
 * Centrado a propósito: es lo que espera alguien que recorta una foto para
 * un feed. Y si la imagen es más pequeña que la proporción pedida, el recorte
 * se reduce: nunca se estira ni se inventan píxeles de más.
 */
export function recorteParaProporcion(
  { ancho, alto }: { ancho: number; alto: number },
  proporcion: Proporcion,
): Recorte {
  const valor = valorDeProporcion(proporcion);
  if (!valor || ancho <= 0 || alto <= 0) return { x: 0, y: 0, ancho, alto };
  const actual = ancho / alto;
  let anchoRecorte = ancho;
  let altoRecorte = alto;
  if (actual > valor) {
    // La imagen es más ancha: se recorta por los lados.
    anchoRecorte = alto * valor;
  } else {
    // La imagen es más alta: se recorta por arriba y por abajo.
    altoRecorte = ancho / valor;
  }
  return {
    x: Math.round((ancho - anchoRecorte) / 2),
    y: Math.round((alto - altoRecorte) / 2),
    ancho: Math.round(anchoRecorte),
    alto: Math.round(altoRecorte),
  };
}

export type Ajustes = {
  /** 100 es normal. */
  brillo: number;
  /** 100 es normal. */
  contraste: number;
  /** 100 es normal. */
  saturacion: number;
  /** true = blanco y negro. */
  grises: boolean;
  /** 0, 90, 180 o 270. */
  rotacion: number;
  proporcion: Proporcion;
};

export const AJUSTES_INICIALES: Ajustes = {
  brillo: 100,
  contraste: 100,
  saturacion: 100,
  grises: false,
  rotacion: 0,
  proporcion: 'libre',
};

/**
 * El filtro de canvas que corresponde a los ajustes.
 *
 * Los valores van del 50 al 150: más allá, el filtro no mejora la foto, la
 * rompe, y un slider que deja bellas fotos de valor 400 es un slider que
 * nunca se usa.
 */
export function filtroCanvas({ brillo, contraste, saturacion, grises }: Omit<Ajustes, 'rotacion' | 'proporcion'>): string {
  const partes: string[] = [];
  if (brillo !== 100) partes.push(`brightness(${Math.round(brillo)}%)`);
  if (contraste !== 100) partes.push(`contrast(${Math.round(contraste)}%)`);
  if (saturacion !== 100) partes.push(`saturacion(${Math.round(saturacion)}%)`);
  if (grises) partes.push('grayscale(100%)');
  return partes.length ? partes.join(' ') : 'none';
}

/** El tamaño de la imagen DESPUÉS de rotarla 90 o 270 grados. */
export function tamanoRotado(ancho: number, alto: number, rotacion: number): { ancho: number; alto: number } {
  const grados = ((Math.round(rotacion / 90) * 90) % 360 + 360) % 360;
  return grados === 90 || grados === 270 ? { ancho: alto, alto: ancho } : { ancho, alto };
}

/** El nombre del archivo editado: el mismo con `_editado` antes de la extensión. */
export function nombreEditado(nombre: string, version: number): string {
  const base = (nombre ?? 'archivo').trim() || 'archivo';
  const punto = base.lastIndexOf('.');
  if (punto > 0) {
    const sinExtension = base.slice(0, punto);
    const extension = base.slice(punto);
    return `${sinExtension}_editado_v${version}${extension}`;
  }
  return `${base}_editado_v${version}`;
}

/**
 * Dibuja la foto con los ajustes y el recorte.
 *
 * Se hace en dos pasos a propósito: primero se rota y se filtra la imagen
 * COMPLETA, y después se recorta el resultado. Recortar antes de rotar daría
 * un encuadre equivocado, y el giro es justo lo que hace que un recorte
 * centrado se vea ladeado.
 *
 * Devuelve el tamaño del lienzo de salida, que es el del recorte.
 */
export function pintarVersion(
  ctx: CanvasRenderingContext2D,
  imagen: CanvasImageSource,
  medidas: { ancho: number; alto: number },
  ajustes: Ajustes,
  destino: { x: number; y: number; ancho: number; alto: number },
  lienzo: HTMLCanvasElement,
): { ancho: number; alto: number } {
  const rotada = tamanoRotado(medidas.ancho, medidas.alto, ajustes.rotacion);
  if (lienzo.width !== rotada.ancho) lienzo.width = rotada.ancho;
  if (lienzo.height !== rotada.alto) lienzo.height = rotada.alto;
  const ctxTrabajo = lienzo.getContext('2d');
  if (!ctxTrabajo) return { ancho: destino.ancho, alto: destino.alto };

  ctxTrabajo.save();
  ctxTrabajo.clearRect(0, 0, rotada.ancho, rotada.alto);
  ctxTrabajo.filter = filtroCanvas(ajustes);
  ctxTrabajo.translate(rotada.ancho / 2, rotada.alto / 2);
  ctxTrabajo.rotate((ajustes.rotacion * Math.PI) / 180);
  ctxTrabajo.drawImage(imagen, -medidas.ancho / 2, -medidas.alto / 2, medidas.ancho, medidas.alto);
  ctxTrabajo.restore();

  const recorte = recorteParaProporcion(rotada, ajustes.proporcion);

  ctx.save();
  ctx.clearRect(destino.x, destino.y, destino.ancho, destino.alto);
  ctx.filter = 'none';
  ctx.drawImage(
    lienzo,
    recorte.x, recorte.y, recorte.ancho, recorte.alto,
    destino.x, destino.y, destino.ancho, destino.alto,
  );
  ctx.restore();

  return { ancho: recorte.ancho, alto: recorte.alto };
}
