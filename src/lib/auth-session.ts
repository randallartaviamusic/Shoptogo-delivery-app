/**
 * Sesión guardada en el navegador que el servidor ya no acepta.
 *
 * Convex Auth guarda el token en `localStorage` y lo reenvía en cada consulta.
 * Si ese token dejó de ser válido (cambió el despliegue, venció el refresco o
 * el servidor lo rechaza), la consulta del usuario se queda esperando y la app
 * sólo muestra el spinner: no hay forma de entrar ni de salir. Borrar los
 * tokens devuelve a la persona a la pantalla de entrada con una sesión limpia.
 */
const RESET_AT_KEY = "shop-to-go:session-reset-at";

/** Borra los tokens de Convex Auth guardados en este navegador. */
export function clearStoredSession() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith("__convexAuth")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento no hay sesión guardada que borrar.
  }
}

/** Deja pasar un solo reinicio por minuto para no caer en un bucle. */
export function canResetSession() {
  try {
    const last = Number(window.sessionStorage.getItem(RESET_AT_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(RESET_AT_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Limpia la sesión local y abre la pantalla de entrada. */
export function restartSession() {
  clearStoredSession();
  window.location.replace("/auth?mode=signin");
}
