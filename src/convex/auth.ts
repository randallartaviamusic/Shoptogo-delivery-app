import { convexAuth } from "@convex-dev/auth/server";
import { emailOtp } from "./auth/emailOtp";
import { rolePassword } from "./auth/password";

// Sin sesiones anónimas: toda persona que use la app tiene su cuenta con correo
// y contraseña (comprador, negocio o repartidor).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, rolePassword],
});
