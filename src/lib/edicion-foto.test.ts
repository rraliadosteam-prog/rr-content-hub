import { describe, expect, it } from 'vitest';
import {
  AJUSTES_INICIALES,
  filtroCanvas,
  nombreEditado,
  pintarVersion,
  recorteParaProporcion,
  tamanoRotado,
  valorDeProporcion,
} from './edicion-foto';

describe('edición de fotos', () => {
  it('el recorte centrado nunca es más grande que la imagen', () => {
    const imagen = { ancho: 1080, alto: 1350 };
    const cuadrado = recorteParaProporcion(imagen, '1:1');
    expect(cuadrado.ancho).toBe(1080);
    expect(cuadrado.alto).toBe(1080);
    expect(cuadrado.y).toBe(135);

    const vertical = recorteParaProporcion(imagen, '9:16');
    expect(vertical.ancho).toBeLessThanOrEqual(1080);
    expect(vertical.alto).toBeLessThanOrEqual(1350);
    expect(Math.round(vertical.ancho / vertical.alto)).toBe(1);
  });

  it('una imagen más ancha que la proporción se recorta por los lados', () => {
    const panoramica = recorteParaProporcion({ ancho: 2000, alto: 1000 }, '1:1');
    expect(panoramica.ancho).toBe(1000);
    expect(panoramica.alto).toBe(1000);
    expect(panoramica.x).toBe(500);
  });

  it('la proporción libre devuelve la imagen entera', () => {
    const libre = recorteParaProporcion({ ancho: 800, alto: 600 }, 'libre');
    expect(libre).toEqual({ x: 0, y: 0, ancho: 800, alto: 600 });
    expect(valorDeProporcion('libre')).toBeNull();
    expect(valorDeProporcion('4:5')).toBeCloseTo(0.8);
  });

  it('el filtro solo lleva lo que se movió', () => {
    expect(filtroCanvas({ brillo: 100, contraste: 100, saturacion: 100, grises: false })).toBe('none');
    expect(filtroCanvas({ brillo: 120, contraste: 100, saturacion: 100, grises: false })).toBe('brightness(120%)');
    expect(filtroCanvas({ brillo: 100, contraste: 110, saturacion: 90, grises: true })).toBe(
      'contrast(110%) saturacion(90%) grayscale(100%)',
    );
  });

  it('girar 90 grados intercambia ancho y alto', () => {
    expect(tamanoRotado(100, 50, 90)).toEqual({ ancho: 50, alto: 100 });
    expect(tamanoRotado(100, 50, 180)).toEqual({ ancho: 100, alto: 50 });
    expect(tamanoRotado(100, 50, 270)).toEqual({ ancho: 50, alto: 100 });
    expect(tamanoRotado(100, 50, 0)).toEqual({ ancho: 100, alto: 50 });
  });

  it('el archivo editado no pisa el original', () => {
    expect(nombreEditado('wundeer_reel.jpg', 2)).toBe('wundeer_reel_editado_v2.jpg');
    expect(nombreEditado('wundeer_reel', 1)).toBe('wundeer_reel_editado_v1');
    expect(AJUSTES_INICIALES.proporcion).toBe('libre');
    expect(AJUSTES_INICIALES.rotacion).toBe(0);
  });

  it('pintar en un lienzo de trabajo devuelve el tamaño del recorte', () => {
    // Un lienzo de trabajo de mentira: la función solo necesita que exista y
    // que devuelva un contexto con los métodos que usa.
    const ctx = {
      canvas: null as unknown,
      save: () => undefined,
      restore: () => undefined,
      clearRect: () => undefined,
      drawImage: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      filter: 'none',
    };
    const lienzo = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    ctx.canvas = lienzo;

    const resultado = pintarVersion(
      ctx as unknown as CanvasRenderingContext2D,
      {} as CanvasImageSource,
      { ancho: 1000, alto: 500 },
      { ...AJUSTES_INICIALES, proporcion: '1:1' },
      { x: 0, y: 0, ancho: 100, alto: 100 },
      lienzo,
    );
    expect(resultado).toEqual({ ancho: 500, alto: 500 });
  });
});
