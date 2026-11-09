import { describe, expect, it } from 'vitest';
import {
  AVISO_CLIENTE_AJENO,
  ETIQUETAS_EVENTO,
  TAMANO_MAX_ENTREGA,
  cabeEnElBucket,
  clienteDeNombre,
  esDeOtroCliente,
  filaDeEvento,
  nombreDeMaterial,
  rutaDeEntrega,
  tamanoLegible,
} from './material';

const CLIENTES = ['wundeer', 'satiro', 'boga'];

describe('material del hub', () => {
  it('saca el cliente del prefijo del nombre', () => {
    expect(clienteDeNombre('wundeer_reel-lanzamiento_2026-11-09.jpg', CLIENTES)).toBe('wundeer');
    expect(clienteDeNombre('SÁTIRO_banner_2026.jpg', CLIENTES)).toBeNull();
    expect(clienteDeNombre('satiro_banner_2026.jpg', CLIENTES)).toBe('satiro');
    expect(clienteDeNombre('material-sin-cliente.jpg', CLIENTES)).toBeNull();
    expect(clienteDeNombre('', CLIENTES)).toBeNull();
    expect(clienteDeNombre(null, CLIENTES)).toBeNull();
  });

  it('avisa cuando el archivo es de otro cliente', () => {
    expect(esDeOtroCliente({ cliente: 'satiro' }, 'wundeer')).toBe(true);
    expect(esDeOtroCliente({ cliente: 'wundeer' }, 'wundeer')).toBe(false);
    // Sin cliente no se inventa uno: tampoco se avisa.
    expect(esDeOtroCliente({ cliente: null }, 'wundeer')).toBe(false);
    expect(AVISO_CLIENTE_AJENO).toMatch(/otro cliente/i);
    expect(AVISO_CLIENTE_AJENO).toMatch(/todos los editores/i);
  });

  it('arma el nombre del material con la convención del equipo', () => {
    expect(nombreDeMaterial('wundeer', 'reel lanzamiento', '2026-11-09')).toBe(
      'wundeer_reel-lanzamiento_2026-11-09.jpg',
    );
    expect(nombreDeMaterial('', '', '')).toBe('material_pieza_sin-fecha.jpg');
  });

  it('arma la ruta de entrega con el cliente delante', () => {
    const ruta = rutaDeEntrega('wundeer', 'mat-abc', 'wundeer_reel.jpg');
    expect(ruta.startsWith('wundeer/')).toBe(true);
    expect(ruta).toContain('mat-abc');
    expect(ruta).toContain('wundeer_reel.jpg');
    // Nada de subir directorios con la ruta.
    expect(rutaDeEntrega('wundeer', '../../etc', '../../passwd')).not.toContain('..');
  });

  it('dice el tamaño en unidades que se leen', () => {
    expect(tamanoLegible(0)).toBe('Sin tamaño');
    expect(tamanoLegible(512)).toBe('512 B');
    expect(tamanoLegible(2048)).toBe('2 KB');
    expect(tamanoLegible(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('el límite del bucket es 50 MB y solo para imágenes', () => {
    expect(TAMANO_MAX_ENTREGA).toBe(50 * 1024 * 1024);
    expect(cabeEnElBucket(1024)).toBe(true);
    expect(cabeEnElBucket(TAMANO_MAX_ENTREGA)).toBe(true);
    expect(cabeEnElBucket(TAMANO_MAX_ENTREGA + 1)).toBe(false);
    expect(cabeEnElBucket(0)).toBe(false);
  });

  it('las tres etiquetas del registro son subir, registrar y entregar', () => {
    expect(Object.keys(ETIQUETAS_EVENTO)).toEqual(['subida', 'registro', 'entrega']);
    expect(ETIQUETAS_EVENTO.subida).toBe('Subió');
    expect(ETIQUETAS_EVENTO.registro).toBe('Registró');
    expect(ETIQUETAS_EVENTO.entrega).toBe('Entregó');
  });

  it('lee una fila del registro y descarta lo que no es un evento conocido', () => {
    const fila = filaDeEvento({
      id: 12,
      at: '2026-11-09T10:00:00.000Z',
      row_id: 'mat-1',
      despues: {
        evento: 'entrega',
        materialId: 'mat-1',
        nombre: 'wundeer_reel.jpg',
        cliente: 'wundeer',
        persona: 'Ana (ana@ejemplo.com)',
        cuentaGoogle: 'ana@ejemplo.com',
      },
    });
    expect(fila?.evento).toBe('entrega');
    expect(fila?.nombre).toBe('wundeer_reel.jpg');
    expect(fila?.cliente).toBe('wundeer');
    expect(fila?.cuentaGoogle).toBe('ana@ejemplo.com');
    expect(filaDeEvento({ despues: { evento: 'inventado' } })).toBeNull();
    expect(filaDeEvento(null)).toBeNull();
  });
});
