import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { correoValido, urlAbrirFlow, urlCarpetaDrive } from './google-flow';

const panel = readFileSync(new URL('../components/google-flow-panel.tsx', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../app/[projectSlug]/flow-ia/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workspace-shell.tsx', import.meta.url), 'utf8');

describe('lanzador de Google Flow', () => {
  it('abre el selector con la cuenta de RR cuando el correo es válido', () => {
    const url = new URL(urlAbrirFlow('  equipo@rraliados.com  '));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/AccountChooser');
    expect(url.searchParams.get('continue')).toBe('https://flow.google.com/');
    expect(url.searchParams.get('Email')).toBe('equipo@rraliados.com');
    expect(url.toString()).toBe(
      'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fflow.google.com%2F&Email=equipo%40rraliados.com',
    );
  });

  it('abre el selector sin Email si la cuenta está vacía o no es un correo', () => {
    for (const cuenta of ['', '   ', 'no-es-correo', 'clave:secreta', null, undefined]) {
      const url = new URL(urlAbrirFlow(cuenta));
      expect(url.searchParams.get('continue')).toBe('https://flow.google.com/');
      expect(url.searchParams.has('Email')).toBe(false);
    }
  });

  it('acepta la carpeta de Drive y rechaza lo que no lo es', () => {
    expect(urlCarpetaDrive('')).toBeNull();
    expect(urlCarpetaDrive('   ')).toBeNull();
    expect(urlCarpetaDrive('javascript:alert(1)')).toBeNull();
    expect(urlCarpetaDrive('http://drive.google.com/drive/folders/abc')).toBeNull();
    expect(urlCarpetaDrive('https://evil.example/drive')).toBeNull();
    expect(urlCarpetaDrive('https://drive.google.com/drive/folders/abc?usp=sharing')).toBe(
      'https://drive.google.com/drive/folders/abc?usp=sharing',
    );
  });

  it('solo considera correo un texto con forma de correo', () => {
    expect(correoValido('persona@rr.co')).toBe('persona@rr.co');
    expect(correoValido('contraseña')).toBeNull();
  });

  it('el módulo no incrusta Flow ni pide contraseñas', () => {
    const fuente = `${panel}\n${pagina}`;
    expect(fuente).not.toMatch(/<iframe/i);
    expect(fuente).not.toMatch(/type=["']password["']/);
    expect(fuente).not.toMatch(/api[_-]?key|service_role|secret/i);
    expect(panel).toMatch(/target="_blank"/);
    expect(panel).toMatch(/rel="noopener noreferrer"/);
    expect(panel).toMatch(/Abrir Flow con la cuenta de RR/);
    expect(panel).toMatch(/Usar otra cuenta/);
    expect(panel).toMatch(/Pendiente: Dirección configura la carpeta de Drive/);
    expect(panel).toMatch(/no se comparten contraseñas/);
    expect(panel).toMatch(/CLAVE_CORREO_FLOW/);
  });

  it('el menú deja Flow junto a las piezas', () => {
    const piezas = shell.indexOf("path: '/ideas'");
    const flow = shell.indexOf("path: '/flow-ia'");
    expect(piezas).toBeGreaterThan(-1);
    expect(flow).toBeGreaterThan(piezas);
    expect(shell).toMatch(/FLOW · IA/);
  });
});
