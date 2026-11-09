/* Temporary verification script — deleted after use. */
import { ConvexHttpClient } from "convex/browser";

const URL = "https://fastidious-oyster-804.convex.cloud";
const email = `prueba-invitado-${Date.now()}@example.com`;
const password = "capricho123";

type Tokens = { token: string; refreshToken: string };

async function authFlow(client: ConvexHttpClient, params: Record<string, unknown>) {
  const result = (await (client as any).action("auth:signIn", {
    provider: "password",
    params,
  })) as { tokens: Tokens };
  client.setAuth(result.tokens.token);
  return result.tokens.token;
}

async function whoami(client: ConvexHttpClient) {
  // Damos tiempo a que el cambio de token propague.
  await new Promise((r) => setTimeout(r, 500));
  const user = (await client.query("users:currentUser", {})) as
    | { _id: string; email?: string; role?: string; isAnonymous?: boolean; name?: string }
    | null;
  return user
    ? `id=${user._id.slice(0, 6)} email=${user.email ?? "-"} role=${user.role ?? "-"} anon=${user.isAnonymous ?? false} name=${user.name ?? "-"}`
    : "sin usuario";
}

// 1) Sesión de invitado (lo que hace la app al abrir).
const client = new ConvexHttpClient(URL);
const anon = (await (client as any).action("auth:signIn", {
  provider: "anonymous",
  params: {},
})) as { tokens: Tokens };
client.setAuth(anon.tokens.token);
console.log("1. invitado:", await whoami(client));

// 2) Crear cuenta desde esa sesión de invitado (como el carrito).
await authFlow(client, {
  email,
  password,
  role: "buyer",
  name: "Prueba Invitado",
  flow: "signUp",
});
console.log("2. tras crear cuenta:", await whoami(client));

// 3) Cerrar sesión: otro cliente, sesión de invitado, e iniciar sesión.
const client2 = new ConvexHttpClient(URL);
const anon2 = (await (client2 as any).action("auth:signIn", {
  provider: "anonymous",
  params: {},
})) as { tokens: Tokens };
client2.setAuth(anon2.tokens.token);
console.log("3. invitado nuevo:", await whoami(client2));

await authFlow(client2, { email, password, role: "buyer", flow: "signIn" });
console.log("4. tras iniciar sesión:", await whoami(client2));
