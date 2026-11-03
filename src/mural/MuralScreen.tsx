import { Principal } from "./Principal";
import { Timeline } from "./Timeline";
import type { ScreenProps } from "./shared";

/** El lienzo del mural, de 1920×1080: el diseño que pide `settings.design`. Lo comparten la TV y la vista previa de Configuración. */
export function MuralScreen(props: ScreenProps) {
  return props.view.settings.design === "timeline" ? <Timeline {...props} /> : <Principal {...props} />;
}
