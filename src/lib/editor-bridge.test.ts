import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  EDITOR_BRIDGE_VERSION,
  bytesComoUint8Array,
  esMensajeEditorGuardado,
  esMensajeEditorListo,
  normalizarMensajeEditorGuardado,
  nombreVersionEditado,
  protocoloEditorListo,
} from './editor-bridge';

describe('puente entre Content Hub y los editores exactos', () => {
  it('acepta solo el handshake válido del editor', () => {
    expect(esMensajeEditorListo({
      type: 'rr-editor-ready',
      version: EDITOR_BRIDGE_VERSION,
      editor: 'rr-imagen',
      nonce: 'rr-editor-1234567890abcdef',
    })).toBe(true);
    expect(esMensajeEditorListo({
      type: 'rr-editor-ready',
      version: EDITOR_BRIDGE_VERSION,
      editor: 'rr-imagen',
      nonce: 'token',
    })).toBe(false);
    expect(esMensajeEditorListo({ type: 'rr-editor-ready', version: 2, editor: 'rr-motion', nonce: 'rr-editor-1234567890abcdef' })).toBe(false);
  });

  it('reconoce el bridge existente de RR Motion sin debilitar el contrato RR', () => {
    expect(protocoloEditorListo({ type: 'filmcraft:ready', version: '1', file: false }, 'rr-motion')).toBe('filmcraft');
    expect(protocoloEditorListo({ type: 'filmcraft:ready', version: '1', file: false }, 'rr-imagen')).toBeNull();
    expect(protocoloEditorListo({ type: 'filmcraft:ready', version: '2', file: false }, 'rr-motion')).toBeNull();

    const guardado = normalizarMensajeEditorGuardado({
      type: 'filmcraft:save',
      nonce: 'rr-editor-1234567890abcdef',
      name: 'salida.mp4',
      filename: 'salida.mp4',
      mime: 'video/mp4',
      bytes: new Uint8Array([1, 2, 3]),
    }, 'rr-motion', 'filmcraft');
    expect(guardado?.editor).toBe('rr-motion');
    expect(guardado?.nombre).toBe('salida.mp4');
    expect(normalizarMensajeEditorGuardado({
      type: 'filmcraft:save',
      nonce: 'rr-editor-1234567890abcdef',
      name: 'otro.mp4',
      filename: 'salida.mp4',
      mime: 'video/mp4',
      bytes: new Uint8Array([1]),
    }, 'rr-motion', 'filmcraft')).toBeNull();
  });

  it('valida los mensajes de guardado y rechaza bytes o metadatos corruptos', () => {
    const valido = {
      type: 'rr-editor-save',
      version: EDITOR_BRIDGE_VERSION,
      editor: 'rr-motion',
      nonce: 'rr-editor-1234567890abcdef',
      nombre: 'salida.mp4',
      mimeType: 'video/mp4',
      bytes: new Uint8Array([1, 2, 3]),
    };
    expect(esMensajeEditorGuardado(valido)).toBe(true);
    expect(esMensajeEditorGuardado({ ...valido, bytes: 'AAAA' })).toBe(false);
    expect(esMensajeEditorGuardado({ ...valido, mimeType: 'text/plain; bad' })).toBe(false);
    expect(esMensajeEditorGuardado({ ...valido, nombre: '' })).toBe(false);
  });

  it('genera copias versionadas sin tocar el nombre fuente ni permitir rutas', () => {
    const fecha = new Date(2026, 10, 9, 14, 5, 6);
    expect(nombreVersionEditado('../wundeer/reel final.mp4', fecha)).toBe(
      'reel final__rr-editado-20261109140506.mp4',
    );
  });

  it('normaliza bytes transferidos desde postMessage aunque vengan de otro realm', () => {
    const original = runInNewContext('new Uint8Array([4, 5, 6])');
    const guardado = normalizarMensajeEditorGuardado({
      protocol: 'rr-editor-bridge',
      type: 'rr-editor-save',
      version: EDITOR_BRIDGE_VERSION,
      editor: 'rr-imagen',
      nonce: 'rr-editor-1234567890abcdef',
      filename: 'salida.png',
      mime: 'image/png',
      bytes: original,
    }, 'rr-imagen', 'rr');
    expect(guardado).not.toBeNull();
    expect([...bytesComoUint8Array(guardado!.bytes)]).toEqual([4, 5, 6]);
  });
});
