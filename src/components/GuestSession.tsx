import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { GUEST_HANDOFF_KEY } from "@/lib/guest-cart";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * Abre una sesión de invitado para que cualquiera entre al mazo como comprador
 * sin registrarse. Cuando la persona crea su cuenta (por ejemplo al confirmar el
 * pedido), esa cuenta pasa a mandar y el carrito se traspasa.
 */
export function GuestSession() {
  const { isLoading, isAuthenticated, user, signIn } = useAuth();
  const adoptGuestCart = useMutation(api.guests.adoptGuestCart);
  const { pathname } = useLocation();
  const inFlight = useRef(false);
  const handingOff = useRef(false);

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

  // El carrito que se armó como invitado pasa a la cuenta apenas la sesión es la
  // de la cuenta (después de iniciar sesión y recargar).
  useEffect(() => {
    if (handingOff.current || !user || user.isAnonymous) return;
    let guestId: string | null = null;
    try {
      guestId = window.sessionStorage.getItem(GUEST_HANDOFF_KEY);
    } catch {
      guestId = null;
    }
    if (!guestId) return;

    handingOff.current = true;
    adoptGuestCart({ guestId: guestId as Id<"users"> })
      .then(() => {
        try {
          window.sessionStorage.removeItem(GUEST_HANDOFF_KEY);
        } catch {
          // Nada que limpiar.
        }
      })
      .catch(() => {
        handingOff.current = false;
      });
  }, [user, adoptGuestCart]);

  return null;
}
