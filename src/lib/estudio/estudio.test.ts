import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Los editores de foto y video que viven DENTRO del hub.
 *
 * Estas pruebas leen el código en vez de ejecutarlo porque lo que se protege
 * aquí son INVARIANTES que se rompen sin que nada falle: que el export siga
 * ofreciendo los dos formatos, que el recorte de fondo siga diciendo «(básico)»
 * mientras no haya IA, que el panel de clip no se esconda, y que el editor no
 * dependa de un servicio externo ni traiga marca ajena.
 */

const foto = readFileSync(new URL('../../components/estudio/photo-studio.tsx', import.meta.url), 'utf8');
const video = readFileSync(new URL('../../components/estudio/video-studio.tsx', import.meta.url), 'utf8');
const exportar = readFileSync(new URL('./video/export.ts', import.meta.url), 'utf8');
const paginaFoto = readFileSync(new URL('../../app/[projectSlug]/editar/foto/page.tsx', import.meta.url), 'utf8');
const paginaVideo = readFileSync(new URL('../../app/[projectSlug]/editar/video/page.tsx', import.meta.url), 'utf8');
const nota = readFileSync(new URL('../../../docs/NOTA_spec_v2_editores.md', import.meta.url), 'utf8');
const webm = readFileSync(new URL('./webm.ts', import.meta.url), 'utf8');

describe('editores dentro del hub', () => {
  it('el video se exporta en WebM y en MP4 (H.264)', () => {
    // El ajuste que pidió Pingui sobre el prototipo: WebM solo no basta.
    expect(exportar).toMatch(/VIDEO_CODECS_H264/);
    expect(exportar).toMatch(/avc1\./);
    expect(exportar).toMatch(/mp4-muxer/);
    expect(exportar).toMatch(/video\/mp4/);
    expect(exportar).toMatch(/video\/webm/);
    // Y los dos se ofrecen en la ventana de exportación.
    expect(video).toMatch(/WebM \(VP9 \+ Opus\)/);
    expect(video).toMatch(/MP4 \(H\.264\)/);
  });

  it('el MP4 avisa cuando sale sin audio, en vez de fallar en silencio', () => {
    expect(exportar).toMatch(/El MP4 salió sin audio/);
    expect(video).toMatch(/result\.aviso/);
  });

  it('el recorte de fondo se rotula «(básico)» mientras no haya IA', () => {
    expect(foto).toMatch(/Quitar fondo \(básico\)/);
    expect(foto).toMatch(/AVISO_QUITAR_FONDO/);
    expect(foto).toMatch(/No hay IA detrás/);
    // Y no se promete una IA que no existe: el único "IA real" del archivo es
    // la frase que dice que todavía NO la hay.
    expect(foto).not.toMatch(/con IA|IA avanzada|IA automática/i);
  });

  it('el panel de velocidad y transición se muestra sin clip seleccionado', () => {
    // El ajuste que pidió Pingui: el panel ya no se esconde, avisa.
    expect(video).toMatch(/AVISO_SIN_CLIP = 'Selecciona un clip'/);
    expect(video).toMatch(/estudio-sin-clip/);
  });

  it('los editores son secciones del hub y no enlaces a otro sitio', () => {
    expect(paginaFoto).toMatch(/PhotoStudio/);
    expect(paginaVideo).toMatch(/VideoStudio/);
    expect(nota).toMatch(/DENTRO del Content Hub/);
  });

  it('no hay marca ni recursos de CapCut', () => {
    for (const archivo of [foto, video, webm]) {
      expect(archivo.toLowerCase()).not.toContain('capcut');
    }
  });

  it('no hay servidor externo: el export se arma en el navegador', () => {
    // Sin ffmpeg.wasm remoto, sin API de terceros, sin Rust ni servidor propio.
    expect(exportar).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(exportar).not.toMatch(/fetch\(['"]https?:/);
    expect(video).not.toMatch(/https?:\/\/(?!localhost)/);
  });
});
