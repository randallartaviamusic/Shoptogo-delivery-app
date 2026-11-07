import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";

/**
 * Abre una sesión de invitado para que cualquiera entre al mazo como comprador
 * sin registrarse. Cuando la persona crea su cuenta (por ejemplo al confirmar el
 * pedido), esa cuenta pasa a mandar y el carrito se traspasa.
 */
export function GuestSession() {
  const { isLoading, isAuthenticated, signIn } = useAuth();
  const inFlight = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || inFlight.current) return;
    inFlight.current = true;
    signIn("anonymous").finally(() => {
      inFlight.current = false;
    });
  }, [isLoading, isAuthenticated, signIn]);

  return null;
}
