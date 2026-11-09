/**
 * Google Picker y Google Identity Services, desde el navegador.
 *
 * Todo lo que necesita el DOM vive aquí, y no en `src/lib/drive.ts`, que es
 * lógica pura y se puede probar en Node.
 *
 * POR QUÉ EL TOKEN SE PIDE EN EL NAVEGADOR Y NO EN EL SERVIDOR
 *
 * El alcance es `drive.file`: la persona da permiso sobre los archivos que
 * el hub cree o que ella elija. Para pedirlo hace falta que Google le muestre
 * la pantalla de consentimiento, y esa pantalla solo se puede abrir en el
 * navegador de la persona. El token que vuelve se queda en memoria, en el
 * navegador, y se manda en la cabecera `Authorization` de cada llamada al
 * proxy del hub. El hub NO lo guarda: no hay token en la base, ni en una
 * cookie, ni en un archivo.
 *
 * NUNCA se borra un archivo de Drive ni se cambian sus permisos: este módulo
 * solo pide lectura de lo elegido y permiso para crear archivos nuevos.
 */

import { SCOPE_DRIVE_FILE, URL_SCRIPT_GSI, URL_SCRIPT_PICKER } from '@/lib/drive';

type GoogleWindow = Window & {
  google?: {
    picker?: any;
    accounts?: any;
  };
};

/**
 * Carga un script una sola vez.
 * Si ya está, se resuelve de inmediato: dos veces el mismo script en la
 * página hace que el Picker se abra dos veces.
 */
function cargarScript(src: string, id: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('No hay navegador.'));
  const existente = document.getElementById(id) as HTMLScriptElement | null;
  if (existente) {
    if (existente.dataset.cargado === '1') return Promise.resolve();
    return new Promise((resolver, rechazar) => {
      existente.addEventListener('load', () => resolver(), { once: true });
      existente.addEventListener('error', () => rechazar(new Error(`No se pudo cargar ${src}`)), { once: true });
    });
  }
  return new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.cargado = '1';
        resolver();
      },
      { once: true },
    );
    script.addEventListener('error', () => rechazar(new Error(`No se pudo cargar ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

export function cargarScriptPicker(): Promise<void> {
  return cargarScript(URL_SCRIPT_PICKER, 'rr-hub-google-picker');
}

export function cargarScriptGsi(): Promise<void> {
  return cargarScript(URL_SCRIPT_GSI, 'rr-hub-google-gsi');
}

/**
 * Pide un token con el alcance `drive.file`.
 *
 * `prompt: ''` hace que Google NO muestre el selector de cuenta: la persona
 * ya tiene una sesión de Google abierta y el consentimiento es el que se pide.
 * La cuenta que Google use es la suya; el hub no la elige.
 */
export async function pedirTokenDrive(clientId: string): Promise<string> {
  await cargarScriptGsi();
  const ventana = window as GoogleWindow;
  const cuentas = ventana.google?.accounts;
  if (!cuentas?.oauth2?.initTokenClient) {
    throw new Error('Google no cargó el módulo de identidad. Revisa la llave y el identificador del cliente OAuth.');
  }
  return new Promise((resolver, rechazar) => {
    const cliente = cuentas.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE_DRIVE_FILE,
      callback: (respuesta: { access_token?: string; error?: string }) => {
        if (respuesta.error || !respuesta.access_token) {
          rechazar(new Error(respuesta.error ?? 'No se consiguió permiso para Drive.'));
          return;
        }
        resolver(respuesta.access_token);
      },
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

export type CarpetaElegida = { id: string; nombre: string };

/**
 * Abre el Google Picker para elegir UNA CARPETA.
 *
 * `setSelectFolderEnabled(true)` + `setIncludeFolders(true)` es lo que hace
 * que se puedan elegir carpetas y no solo archivos. `setOAuthToken` conecta el
 * picker con el token `drive.file`, así que el Picker solo ve lo que la
 * persona autorizó: no se le enseña el Drive entero.
 */
export async function abrirPickerCarpeta({
  apiKey,
  token,
  titulo = 'Elige la carpeta de Drive',
}: {
  apiKey: string;
  token: string;
  titulo?: string;
}): Promise<CarpetaElegida | null> {
  await cargarScriptPicker();
  const ventana = window as GoogleWindow;
  const picker = ventana.google?.picker;
  if (!picker) throw new Error('El Google Picker no cargó.');

  return new Promise((resolver) => {
    const vista = new picker.DocsView(picker.DocsView.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .addScope(SCOPE_DRIVE_FILE);

    const constructor = new picker.PickerBuilder()
      .addView(vista)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setTitle(titulo)
      .setCallback((datos: { action: string; docs?: { id: string; name?: string }[] }) => {
        if (datos.action === picker.Action.PICKED && datos.docs?.[0]?.id) {
          resolver({ id: datos.docs[0].id, nombre: datos.docs[0].name ?? 'Carpeta' });
          return;
        }
        if (datos.action === picker.Action.CANCEL) {
          resolver(null);
          return;
        }
        // `Action.DOCS` y compañía: no pasó nada.
        resolver(null);
      })
      .build();

    constructor.setVisible(true);
  });
}
