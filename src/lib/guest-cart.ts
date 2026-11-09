/**
 * Clave donde guardamos el id del invitado para traspasarle el carrito a la
 * cuenta nueva. Se guarda antes de recargar la app al iniciar sesión y se
 * consume cuando la cuenta ya está activa.
 */
export const GUEST_HANDOFF_KEY = "capricho:guest-cart-handoff";
