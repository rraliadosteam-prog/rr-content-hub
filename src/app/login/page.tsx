import { Suspense } from 'react';
import { getClientesParaLaPuerta } from '@/lib/puerta';
import Formulario, { PuertaEsqueleto } from './formulario';

/**
 * La puerta del hub, página de SERVIDOR.
 *
 * MEDIDO 2026-11-09: la spec v2 decía que `/login` no existía y que no se
 * iba a implementar sin un contrato de identidad. El contrato ya existe: es el
 * de la puerta por código de cuatro dígitos (`/api/entrar` y la cookie firmada
 * de `hub-session.ts`), que ya está en producción. Esta pantalla es SU puerta:
 * la misma, sin tocar la base real.
 *
 * La lista de clientes la lee el SERVIDOR (`lib/puerta.ts`) y se pasa al
 * formulario como prop: sale de `rr_hub_projects.access_code`, así que un
 * cliente nuevo aparece sin que nadie edite un archivo.
 *
 * La separación de archivos no es estilo. La página lee la base (es de
 * servidor) y el formulario usa `useState`/`useSearchParams` (es de cliente):
 * Next rechaza un componente de cliente `async`.
 *
 * El `Suspense` está por `useSearchParams`: sin esa frontera, el build falla al
 * prerenderizar `/login`. Cae alrededor del FORMULARIO, no de la página
 * entera, para que el shell (logo, título, textos) se prerenderice igual.
 */
export default async function LoginPage() {
  const clientes = await getClientesParaLaPuerta();

  return (
    <Suspense fallback={<PuertaEsqueleto />}>
      <Formulario clientes={clientes} />
    </Suspense>
  );
}
