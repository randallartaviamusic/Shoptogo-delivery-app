import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Cuánto esperamos a que Convex nos diga quién es la persona antes de abrir la
 * app igual. Si un token guardado ya no sirve, la consulta de la cuenta puede
 * quedar esperando para siempre y sin este límite la app se queda en
 * "Cargando..." sin forma de entrar.
 */
const AUTH_TIMEOUT_MS = 8000;

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Solo esperamos la ficha del usuario cuando hay una sesión abierta: si no
  // hay sesión, la query devuelve null y no tiene sentido seguir cargando.
  const pending = isAuthLoading || (isAuthenticated && user === undefined);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!pending) {
      setGaveUp(false);
      return;
    }
    const timer = setTimeout(() => setGaveUp(true), AUTH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const stuck = pending && gaveUp;

  return {
    isLoading: pending && !stuck,
    /** Hay una sesión guardada que el servidor no confirma. */
    stuck,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}

export { useAuthActions };
