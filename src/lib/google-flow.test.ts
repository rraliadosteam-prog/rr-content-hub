import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { urlAbrirFlow, urlCarpetaDrive } from './google-flow';

const panel = readFileSync(new URL('../components/google-flow-panel.tsx', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../app/[projectSlug]/flow-ia/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/workspace-shell.tsx', import.meta.url), 'utf8');

describe('lanzador de Google Flow', () => {
  it('abre el selector de Google con Flow de destino', () => {
    const url = new URL(urlAbrirFlow());
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/AccountChooser');
    expect(url.searchParams.get('continue')).toBe('https://flow.google.com/');
  });

  it('NO preselecciona ninguna cuenta: ni Email, ni hd, ni login_hint', () => {
    const url = new URL(urlAbrirFlow());
    expect(url.searchParams.has('Email')).toBe(false);
    expect(url.searchParams.has('hd')).toBe(false);
    expect(url.searchParams.has('login_hint')).toBe(false);
    // Y no hay forma de pasarle una cuenta: la función no recibe parámetros.
    expect(urlAbrirFlow.length).toBe(0);
    expect(url.toString()).toBe(
      'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fflow.google.com%2F',
    );
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

  it('el módulo no incrusta Flow ni pide contraseñas', () => {
    const fuente = `${panel}\n${pagina}`;
    expect(fuente).not.toMatch(/<iframe/i);
    expect(fuente).not.toMatch(/type=["']password["']/);
    expect(fuente).not.toMatch(/api[_-]?key|service_role|secret/i);
    expect(panel).toMatch(/target="_blank"/);
    expect(panel).toMatch(/rel="noopener noreferrer"/);
  });

  it('no existe el botón de la cuenta de empresa ni el de «otra cuenta»', () => {
    expect(panel).not.toMatch(/Abrir Flow con la cuenta de RR/);
    expect(panel).not.toMatch(/Usar otra cuenta/);
    expect(panel).not.toMatch(/Recordar mi correo/);
    expect(panel).not.toMatch(/localStorage/);
  });

  it('hay un único botón «Abrir Flow» con aviso de que se abre fuera del hub', () => {
    expect(panel).toMatch(/Abrir Flow/);
    expect(panel).toMatch(/FUERA del hub/i);
    expect(panel).toMatch(/se abre en una pestaña nueva/i);
    // Un solo enlace con el botón principal: dos harían dudar de cuál es.
    expect(panel.match(/data-testid="flow-abrir"/g)?.length ?? 0).toBe(1);
    expect(panel).not.toMatch(/data-testid="flow-abrir-rr"/);
    expect(panel).not.toMatch(/data-testid="flow-otra-cuenta"/);
  });

  it('el menú deja Flow junto a las piezas y el material aparte', () => {
    const piezas = shell.indexOf("path: '/ideas'");
    const flow = shell.indexOf("path: '/flow-ia'");
    const material = shell.indexOf("path: '/material'");
    expect(piezas).toBeGreaterThan(-1);
    expect(flow).toBeGreaterThan(piezas);
    expect(material).toBeGreaterThan(flow);
    expect(shell).toMatch(/FLOW · IA/);
    expect(shell).toMatch(/MATERIAL/);
  });
});
