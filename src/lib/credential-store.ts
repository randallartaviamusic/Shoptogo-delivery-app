import { Capacitor, registerPlugin } from "@capacitor/core";

const REMEMBERED_EMAIL_KEY = "shop-to-go:remembered-email";

interface CredentialStorePlugin {
  save(options: { email: string; password: string }): Promise<void>;
  read(): Promise<{ email?: string; password?: string } | undefined>;
  clear(): Promise<void>;
}

const nativeStore = registerPlugin<CredentialStorePlugin>("CredentialStore");

/** El APK de Android guarda el correo y la contraseña cifrados en el teléfono. */
export function usesNativeCredentialStore() {
  return Capacitor.getPlatform() === "android";
}

export function readRememberedEmail() {
  if (usesNativeCredentialStore()) return "";
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function loadRememberedCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  if (usesNativeCredentialStore()) {
    try {
      const saved = await nativeStore.read();
      if (saved?.email && saved.password) {
        return { email: saved.email, password: saved.password };
      }
    } catch {
      // APK anterior o plugin no disponible: seguimos sin autocompletar.
    }
    return null;
  }

  const email = readRememberedEmail();
  return email ? { email, password: "" } : null;
}

export async function rememberCredentials(
  email: string,
  password: string,
  name?: string,
) {
  if (usesNativeCredentialStore()) {
    try {
      await nativeStore.save({ email, password });
    } catch {
      // Si el teléfono no deja guardar, el inicio de sesión sigue igual.
    }
    return;
  }

  try {
    window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  } catch {
    // Sin almacenamiento igual usamos el gestor de contraseñas del navegador.
  }

  // En la web no guardamos la contraseña nosotros: se la pedimos al gestor de
  // contraseñas del navegador. Si no está disponible, el formulario tiene los
  // atributos autocomplete para que el navegador ofrezca guardarla.
  void storeInPasswordManager(email, password, name);
}

export async function forgetCredentials() {
  if (usesNativeCredentialStore()) {
    try {
      await nativeStore.clear();
    } catch {
      // No había nada guardado.
    }
    return;
  }

  try {
    window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Sin almacenamiento no hay correo guardado.
  }
}

type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
  name?: string;
}) => Credential;

async function storeInPasswordManager(
  email: string,
  password: string,
  name?: string,
) {
  if (!window.isSecureContext) return;

  const PasswordCredential = (
    window as unknown as { PasswordCredential?: PasswordCredentialConstructor }
  ).PasswordCredential;
  if (!PasswordCredential || !navigator.credentials?.store) return;

  try {
    const credential = new PasswordCredential({
      id: email,
      password,
      name: name?.trim() || email,
    });
    await navigator.credentials.store(credential);
  } catch {
    // El navegador puede no tener un gestor de contraseñas: no es un error.
  }
}
