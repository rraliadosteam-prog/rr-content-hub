import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Comprobaciones de fuente del módulo de material.
 *
 * Estas pruebas leen los archivos en vez de ejecutarlos porque lo que
 * protegido aquí son INVARIANTES, no resultados: que el proxy no tenga forma
 * de borrar, que el video esté marcado como «Próximamente», que las variables
 * nuevas estén documentadas como pendientes y que la política de contenido
 * deje cargar el Picker de Google.
 */

const panel = readFileSync(new URL('../components/material-panel.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../components/estudio/photo-studio.tsx', import.meta.url), 'utf8');
const editorVideo = readFileSync(new URL('../components/estudio/video-studio.tsx', import.meta.url), 'utf8');
const paginaFoto = readFileSync(new URL('../app/[projectSlug]/editar/foto/page.tsx', import.meta.url), 'utf8');
const paginaVideo = readFileSync(new URL('../app/[projectSlug]/editar/video/page.tsx', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../app/[projectSlug]/material/page.tsx', import.meta.url), 'utf8');
const drive = readFileSync(new URL('../app/api/drive/[accion]/route.ts', import.meta.url), 'utf8');
const material = readFileSync(new URL('../app/api/material/[accion]/route.ts', import.meta.url), 'utf8');
const csp = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
const env = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const server = readFileSync(new URL('./material-server.ts', import.meta.url), 'utf8');

describe('módulo de material', () => {
  it('el proxy de Drive no puede borrar ni cambiar permisos', () => {
    // Ni una acción, ni una llamada, ni un texto que lo prometa.
    expect(drive).not.toMatch(/delete/i);
    expect(drive).not.toMatch(/trash/i);
    expect(drive).not.toMatch(/permissions/i);
    expect(drive).not.toMatch(/addPermission|updatePermission|deletePermission/);
  });

  it('el proxy de Drive pide el alcance drive.file y usa el token de la cabecera', () => {
    expect(drive).toMatch(/Authorization/);
    expect(drive).toMatch(/Bearer/);
    expect(drive).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('el video se edita en el editor de video del hub, no en el de foto', () => {
    // MEDIDO 2026-11-09. Antes el video de Material era un «Próximamente» y
    // el editor de foto era el único editor. Con los editores de la misión B
    // integrados en el hub, el video tiene destino: la sección «Editar video».
    expect(panel).toMatch(/editar\/video/);
    expect(panel).not.toMatch(/Video · Próximamente/);
    // El editor de FOTO sigue sin ser un editor de video: no tiene etiqueta de
    // video, ni tipo de video, ni captura de video.
    expect(editor).not.toMatch(/<video/);
    expect(editor).not.toMatch(/video\/mp4/);
    expect(editor).not.toMatch(/captureStream/);
    // Y el de video sí: exporta en WebM y en MP4 (H.264).
    expect(editorVideo).toMatch(/mp4/);
    expect(editorVideo).toMatch(/H\.264/);
  });

  it('los editores son secciones del hub, no enlaces a otro sitio', () => {
    // Decisión de Rosas: los editores de foto y video van DENTRO del hub.
    expect(paginaFoto).toMatch(/PhotoStudio/);
    expect(paginaVideo).toMatch(/VideoStudio/);
    expect(paginaFoto).not.toMatch(/href="http/);
    expect(paginaVideo).not.toMatch(/href="http/);
  });

  it('el panel avisa cuando el archivo es de otro cliente', () => {
    expect(panel).toMatch(/material-ajeno-/);
    expect(panel).toMatch(/esDeOtroCliente/);
    expect(panel).toMatch(/AVISO_CLIENTE_AJENO/);
  });

  it('el panel ofrece la entrega y el registro de auditoría', () => {
    expect(panel).toMatch(/Entregar versión final/);
    expect(panel).toMatch(/material-registro/);
    expect(panel).toMatch(/Vence en/);
  });

  it('la entrega solo acepta imágenes y solo cabe hasta 50 MB', () => {
    expect(material).toMatch(/TAMANO_MAX_ENTREGA/);
    expect(material).toMatch(/firmaDeImagen/);
    expect(material).toMatch(/solo admite imágenes/i);
  });

  it('la entrega copia al bucket privado y firma el enlace con vencimiento', () => {
    expect(server).toMatch(/createSignedUrl/);
    expect(server).toMatch(/BUCKET_MATERIAL/);
    expect(server).toMatch(/rr-content-assets/);
    expect(server).toMatch(/minutosDeEntrega/);
  });

  it('el registro de auditoría guarda los tres eventos', () => {
    expect(material).toMatch(/'subida'/);
    expect(material).toMatch(/'registro'/);
    expect(material).toMatch(/'entrega'/);
    expect(server).toMatch(/rr_hub_audit_log/);
  });

  it('la página del módulo no inventa nada: usa los clientes de la base', () => {
    expect(pagina).toMatch(/getProjects/);
    expect(pagina).toMatch(/credencialesDriveListas/);
    expect(pagina).not.toMatch(/wundeer/i);
  });

  it('la política de contenido deja cargar el Picker y el módulo de identidad', () => {
    expect(csp).toMatch(/https:\/\/apis\.google\.com/);
    expect(csp).toMatch(/https:\/\/accounts\.google\.com/);
    expect(csp).toMatch(/https:\/\/www\.googleapis\.com/);
  });

  it('las variables nuevas están en .env.example y marcadas como pendientes', () => {
    for (const variable of [
      'NEXT_PUBLIC_GOOGLE_API_KEY',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
      'HUB_ENTREGA_URL_MINUTOS',
      'NEXT_PUBLIC_FLOW_DRIVE_FOLDER_URL',
    ]) {
      expect(env).toContain(variable);
    }
    expect(env.match(/Pendiente de configurar/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // La cuenta de empresa no vuelve, ni siquiera como variable.
    expect(env).not.toMatch(/NEXT_PUBLIC_FLOW_DEFAULT_ACCOUNT=/);
    // Ni secretos con valores de ejemplo.
    expect(env).not.toMatch(/AIza/);
    expect(env).not.toMatch(/-----BEGIN/);
  });
});
