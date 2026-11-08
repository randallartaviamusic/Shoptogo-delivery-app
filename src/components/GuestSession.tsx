import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Abre una sesión de invitado para que cualquiera entre al mazo como comprador
 * sin registrarse. Cuando la persona crea su cuenta (por ejemplo al confirmar el
 * pedido), esa cuenta pasa a mandar y el carrito se traspasa.
 */
export function GuestSession() {
  const { isLoading, isAuthenticated, signIn } = useAuth();
  const { pathname } = useLocation();
  const inFlight = useRef(false);

  // En /auth no abrimos sesión de invitado: una sesión anónima que llegue tarde
  // podría pisar el ingreso que la persona acaba de hacer con su cuenta.
  const skip = pathname.startsWith("/auth");

  useEffect(() => {
    if (skip || isLoading || isAuthenticated || inFlight.current) return;
    inFlight.current = true;
    signIn("anonymous")
      .catch(() => {
        // Si falla, se reintenta en la próxima navegación.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [skip, isLoading, isAuthenticated, signIn]);

  return null;
}
