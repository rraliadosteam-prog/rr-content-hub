import { describe, expect, it } from 'vitest';
import {
  SCOPE_DRIVE_FILE,
  archivoDeDrive,
  archivosDeDrive,
  consultaDeArchivos,
  credencialesDriveListas,
  cuentaGoogleDe,
  esImagen,
  esVideo,
  idDriveValido,
  textoBusquedaSeguro,
} from './drive';

describe('integración con Google Drive', () => {
  it('el alcance es drive.file, no drive ni drive.readonly', () => {
    expect(SCOPE_DRIVE_FILE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(SCOPE_DRIVE_FILE).not.toBe('https://www.googleapis.com/auth/drive');
    expect(SCOPE_DRIVE_FILE).not.toBe('https://www.googleapis.com/auth/drive.readonly');
    expect(SCOPE_DRIVE_FILE).not.toContain('readonly');
  });

  it('las credenciales públicas se detectan y, si faltan, el estado es pendiente', () => {
    expect(credencialesDriveListas({})).toBe('pendiente');
    expect(credencialesDriveListas({ NEXT_PUBLIC_GOOGLE_API_KEY: 'llave' })).toBe('pendiente');
    expect(credencialesDriveListas({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'cliente' })).toBe('pendiente');
    expect(
      credencialesDriveListas({ NEXT_PUBLIC_GOOGLE_API_KEY: 'llave', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'cliente' }),
    ).toBe('listo');
    // Un espacio no cuenta como llave: la variable existe pero está vacía.
    expect(
      credencialesDriveListas({ NEXT_PUBLIC_GOOGLE_API_KEY: '  ', NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'cliente' }),
    ).toBe('pendiente');
  });

  it('valida los identificadores de Drive', () => {
    expect(idDriveValido('1a2B3c4D5e6F7g8H9i0J')).toBe(true);
    expect(idDriveValido('demo-carpeta-wundeer')).toBe(true);
    expect(idDriveValido('corto')).toBe(false);
    expect(idDriveValido("abc' OR 1=1")).toBe(false);
    expect(idDriveValido('abc def')).toBe(false);
    expect(idDriveValido(null)).toBe(false);
    expect(idDriveValido(42)).toBe(false);
  });

  it('escapa la búsqueda para que no rompa la consulta de Drive', () => {
    expect(textoBusquedaSeguro("o'brien")).toBe("o\\'brien");
    expect(textoBusquedaSeguro('barra\\')).toBe('barra\\\\');
    expect(textoBusquedaSeguro(' onormal  ')).toBe('onormal');
    expect(textoBusquedaSeguro('x'.repeat(200)).length).toBe(80);
  });

  it('la consulta filtra por carpeta y por nombre, y nunca pide carpetas', () => {
    const consulta = consultaDeArchivos({ carpetaId: 'demo-carpeta-wundeer', busqueda: 'reel' });
    expect(consulta).toContain("mimeType != 'application/vnd.google-apps.folder'");
    expect(consulta).toContain("'demo-carpeta-wundeer' in parents");
    expect(consulta).toContain("name contains 'reel'");
  });

  it('sin carpeta la consulta lista todo lo que la persona autorizó', () => {
    const consulta = consultaDeArchivos({});
    expect(consulta).toContain("mimeType != 'application/vnd.google-apps.folder'");
    expect(consulta).not.toContain('in parents');
  });

  it('traduce la respuesta de Drive y descarta lo que no se puede leer', () => {
    const archivo = archivoDeDrive({
      id: '1a2B3c4D5e6F7g8H9i0J',
      name: 'wundeer_reel_2026-11-09.jpg',
      mimeType: 'image/jpeg',
      size: '2048',
      parents: ['demo-carpeta-wundeer'],
    });
    expect(archivo?.nombre).toBe('wundeer_reel_2026-11-09.jpg');
    expect(archivo?.tamano).toBe(2048);
    expect(archivo?.esImagen).toBe(true);
    expect(archivo?.esVideo).toBe(false);
    expect(archivo?.carpetaId).toBe('demo-carpeta-wundeer');

    expect(archivoDeDrive({ id: 'corto', name: 'x.jpg' })).toBeNull();
    expect(archivoDeDrive(null)).toBeNull();
    expect(archivosDeDrive([{ id: 'x' }, { id: '1a2B3c4D5e6F7g8H9i0J' }])).toHaveLength(1);
  });

  it('distingue imagen de video', () => {
    expect(esImagen('image/png')).toBe(true);
    expect(esImagen('image/svg+xml')).toBe(false);
    expect(esVideo('video/mp4')).toBe(true);
    expect(esVideo('image/png')).toBe(false);
  });

  it('lee la cuenta de Google que devuelve Google', () => {
    expect(cuentaGoogleDe({ email: 'persona@ejemplo.com', name: 'Persona' })).toEqual({
      correo: 'persona@ejemplo.com',
      nombre: 'Persona',
    });
    expect(cuentaGoogleDe({ name: 'Sin correo' })).toBeNull();
    expect(cuentaGoogleDe(null)).toBeNull();
  });
});
