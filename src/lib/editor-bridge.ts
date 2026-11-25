export const EDITOR_BRIDGE_VERSION = 1;

export type EditorKind = 'rr-imagen' | 'rr-motion';
export type EditorProtocol = 'rr' | 'filmcraft';

export type EditorReadyMessage = {
  type: 'rr-editor-ready';
  version: typeof EDITOR_BRIDGE_VERSION;
  editor: EditorKind;
  nonce: string;
};

export type EditorSaveMessage = {
  type: 'rr-editor-save';
  version: typeof EDITOR_BRIDGE_VERSION;
  editor: EditorKind;
  nonce: string;
  nombre: string;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array;
};

const NONCE_RE = /^rr-(?:editor|motion)-[A-Za-z0-9.-]{10,160}$/;
const MIME_RE = /^[\w.+-]+\/[\w.+-]+$/;

export function crearNonceEditor(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `rr-editor-${uuid}`;
  const aleatorio = Math.random().toString(36).slice(2);
  return `rr-editor-${Date.now().toString(36)}-${aleatorio}`;
}

export function esEditorKind(value: unknown): value is EditorKind {
  return value === 'rr-imagen' || value === 'rr-motion';
}

export function esNonceEditor(value: unknown): value is string {
  return typeof value === 'string' && NONCE_RE.test(value);
}

export function esMensajeEditorListo(value: unknown): value is EditorReadyMessage {
  if (!value || typeof value !== 'object') return false;
  const mensaje = value as Record<string, unknown>;
  return (
    mensaje.type === 'rr-editor-ready' &&
    mensaje.version === EDITOR_BRIDGE_VERSION &&
    esEditorKind(mensaje.editor) &&
    esNonceEditor(mensaje.nonce)
  );
}

function esArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function esBytes(value: unknown): value is ArrayBuffer | Uint8Array {
  return esArrayBuffer(value) || ArrayBuffer.isView(value);
}

export function protocoloEditorListo(value: unknown, esperado: EditorKind): EditorProtocol | null {
  if (esMensajeEditorListo(value) && value.editor === esperado) return 'rr';
  if (!value || typeof value !== 'object') return null;
  const mensaje = value as Record<string, unknown>;
  if (
    mensaje.protocol === 'rr-editor-bridge' &&
    mensaje.version === EDITOR_BRIDGE_VERSION &&
    mensaje.type === 'rr-editor-ready' &&
    mensaje.editor === esperado
  ) return 'rr';
  if (esperado === 'rr-motion' && mensaje.type === 'filmcraft:ready' && mensaje.version === '1' && mensaje.file === false) return 'filmcraft';
  return null;
}

export function esMensajeEditorGuardado(value: unknown): value is EditorSaveMessage {
  if (!value || typeof value !== 'object') return false;
  const mensaje = value as Record<string, unknown>;
  return (
    mensaje.type === 'rr-editor-save' &&
    mensaje.version === EDITOR_BRIDGE_VERSION &&
    esEditorKind(mensaje.editor) &&
    esNonceEditor(mensaje.nonce) &&
    typeof mensaje.nombre === 'string' &&
    mensaje.nombre.trim().length > 0 &&
    mensaje.nombre.length <= 240 &&
    typeof mensaje.mimeType === 'string' &&
    MIME_RE.test(mensaje.mimeType) &&
    esBytes(mensaje.bytes)
  );
}

/**
 * Makes a source-preserving output name. The original Drive file is never
 * overwritten by the editor bridge.
 */
export function normalizarMensajeEditorGuardado(
  value: unknown,
  esperado: EditorKind,
  protocolo: EditorProtocol,
): EditorSaveMessage | null {
  if (protocolo === 'rr') {
    if (esMensajeEditorGuardado(value) && value.editor === esperado) return value;
    if (!value || typeof value !== 'object') return null;
    const mensaje = value as Record<string, unknown>;
    const nombre = typeof mensaje.filename === 'string' ? mensaje.filename : '';
    const mimeType = typeof mensaje.mime === 'string' ? mensaje.mime : '';
    if (
      mensaje.protocol !== 'rr-editor-bridge' ||
      mensaje.version !== EDITOR_BRIDGE_VERSION ||
      mensaje.type !== 'rr-editor-save' ||
      mensaje.editor !== esperado ||
      typeof mensaje.nonce !== 'string' ||
      !esNonceEditor(mensaje.nonce) ||
      !nombre ||
      !mimeType ||
      !MIME_RE.test(mimeType) ||
      !esBytes(mensaje.bytes)
    ) return null;
    return {
      type: 'rr-editor-save',
      version: EDITOR_BRIDGE_VERSION,
      editor: esperado,
      nonce: mensaje.nonce,
      nombre,
      mimeType,
      bytes: mensaje.bytes,
    };
  }
  if (!value || typeof value !== 'object') return null;
  const mensaje = value as Record<string, unknown>;
  const filename = typeof mensaje.filename === 'string' ? mensaje.filename : '';
  const alias = typeof mensaje.name === 'string' ? mensaje.name : '';
  const nombre = filename || alias;
  const mimeType = typeof mensaje.mime === 'string' ? mensaje.mime : '';
  if (
    filename && alias && filename !== alias ||
    mensaje.type !== 'filmcraft:save' ||
    typeof mensaje.nonce !== 'string' ||
    !esNonceEditor(mensaje.nonce) ||
    !nombre ||
    !mimeType ||
    !MIME_RE.test(mimeType) ||
    !esBytes(mensaje.bytes)
  ) return null;
  return {
    type: 'rr-editor-save',
    version: EDITOR_BRIDGE_VERSION,
    editor: esperado,
    nonce: mensaje.nonce,
    nombre,
    mimeType,
    bytes: mensaje.bytes,
  };
}

export function nombreVersionEditado(nombre: string, ahora = new Date()): string {
  const limpio = nombre.trim().split(/[\\/]/).pop() || 'archivo';
  const seguro = limpio.replace(/[^\w.()\- áéíóúÁÉÍÓÚñÑ]/g, '_').slice(0, 180) || 'archivo';
  const punto = seguro.lastIndexOf('.');
  const base = punto > 0 ? seguro.slice(0, punto) : seguro;
  const extension = punto > 0 ? seguro.slice(punto) : '';
  const sello = [
    ahora.getFullYear().toString().padStart(4, '0'),
    (ahora.getMonth() + 1).toString().padStart(2, '0'),
    ahora.getDate().toString().padStart(2, '0'),
    ahora.getHours().toString().padStart(2, '0'),
    ahora.getMinutes().toString().padStart(2, '0'),
    ahora.getSeconds().toString().padStart(2, '0'),
  ].join('');
  return `${base}__rr-editado-${sello}${extension}`.slice(0, 240);
}

export function bytesComoUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (esArrayBuffer(bytes)) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    const view = bytes as unknown as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array(bytes as ArrayBuffer);
}
