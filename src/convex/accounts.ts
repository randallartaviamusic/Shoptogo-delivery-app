import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { roleValidator } from "./schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * La contraseña nunca se guarda en claro: se guarda un hash SHA-256 con el
 * correo como sal, para que dos cuentas con la misma contraseña no compartan
 * el mismo hash.
 */
async function hashPassword(email: string, password: string) {
  const data = new TextEncoder().encode(`${email}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Registro con correo y contraseña. El rol se elige acá. */
export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    passwordConfirm: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const name = args.name.trim();

    if (!EMAIL_PATTERN.test(email)) throw new Error("Escribí un correo válido");
    if (name.length < 2) throw new Error("Escribí tu nombre");
    if (args.password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
    if (args.password !== args.passwordConfirm) {
      throw new Error("Las contraseñas no coinciden");
    }

    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      throw new Error("Ya existe una cuenta con ese correo. Iniciá sesión.");
    }

    await ctx.db.insert("accounts", {
      email,
      name,
      passwordHash: await hashPassword(email, args.password),
      role: args.role,
    });

    return { email };
  },
});

/** Inicio de sesión de una cuenta ya registrada. */
export const verifyPassword = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!account) {
      throw new Error("No encontramos una cuenta con ese correo. Registrate.");
    }

    const passwordHash = await hashPassword(email, args.password);
    if (passwordHash !== account.passwordHash) {
      throw new Error("La contraseña no es correcta");
    }

    return { email, name: account.name, role: account.role };
  },
});

/** Copia nombre y rol de la cuenta al usuario de Convex Auth ya autenticado. */
export const bindCurrentUser = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");

    const email = normalizeEmail(args.email);
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!account) throw new Error("No encontramos tu cuenta");

    await ctx.db.patch(userId, {
      name: account.name,
      email,
      role: account.role,
      onboarded: true,
    });

    return { role: account.role };
  },
});
