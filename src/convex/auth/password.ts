import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";

const scrypt = new Scrypt();

const ROLES = ["buyer", "business", "courier"] as const;
type AccountRole = (typeof ROLES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(value: unknown): value is AccountRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Traduce los errores internos del paquete a algo que la persona entienda. */
function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/already exists/i.test(message)) {
    return "Ya existe una cuenta con ese correo para ese rol. Probá iniciar sesión.";
  }
  if (/InvalidAccountId|InvalidSecret|invalid secret/i.test(message)) {
    return "Correo o contraseña incorrectos.";
  }
  return "No pudimos completar el ingreso. Intentá de nuevo.";
}

/**
 * Ingreso con correo y contraseña, sin códigos por correo.
 *
 * El identificador de la cuenta incluye el rol (`business:ana@correo.com`), así
 * el mismo correo puede tener una cuenta de comprador, otra de negocio y otra de
 * repartidor: cada rol es una cuenta aparte, con su propia contraseña.
 */
export const rolePassword = ConvexCredentials({
  id: "password",
  authorize: async (params, ctx) => {
    const email = String(params.email ?? "").trim().toLowerCase();
    const password = String(params.password ?? "");
    const role = isRole(params.role) ? params.role : "buyer";
    const name = String(params.name ?? "").trim();

    if (!EMAIL_PATTERN.test(email)) {
      throw new ConvexError("Escribí un correo válido");
    }

    const accountId = `${role}:${email}`;

    if (params.flow === "signUp") {
      if (name.length < 2) throw new ConvexError("Escribí tu nombre");
      if (password.length < 8) {
        throw new ConvexError("La contraseña debe tener al menos 8 caracteres");
      }

      try {
        const { user } = await createAccount(ctx, {
          provider: "password",
          account: { id: accountId, secret: password },
          profile: { email, name, role },
        });
        if (!user) throw new ConvexError("No pudimos crear tu cuenta");
        return { userId: user._id };
      } catch (error) {
        if (error instanceof ConvexError) throw error;
        throw new ConvexError(friendlyAuthError(error));
      }
    }

    if (params.flow !== "signIn") {
      throw new ConvexError("Forma de ingreso no válida");
    }

    // Para entrar no hace falta recordar con qué rol se creó la cuenta: probamos
    // el rol elegido y después los otros. La contraseña sigue siendo la llave, así
    // que las cuentas siguen siendo separadas.
    const candidates: AccountRole[] = [
      role,
      ...ROLES.filter((item) => item !== role),
    ];

    for (const candidate of candidates) {
      try {
        const retrieved = await retrieveAccount(ctx, {
          provider: "password",
          account: { id: `${candidate}:${email}`, secret: password },
        });
        if (retrieved) return { userId: retrieved.user._id };
      } catch {
        // No hay cuenta con ese rol o la contraseña no coincide: seguimos.
      }
    }

    throw new ConvexError(
      "Correo o contraseña incorrectos. Si tu cuenta es de antes de este cambio, volvé a crearla con correo y contraseña.",
    );
  },
  crypto: {
    hashSecret: (secret) => scrypt.hash(secret),
    verifySecret: (secret, hash) => scrypt.verify(hash, secret),
  },
});
