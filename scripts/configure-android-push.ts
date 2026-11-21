import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";

/**
 * El plugin nativo de push usa Firebase. Si el APK se compila sin un
 * google-services.json válido, la primera llamada a PushNotifications.register()
 * lanza una excepción en el hilo de plugins de Capacitor y cierra la app entera.
 *
 * Este paso corre después de `cap sync` y antes de Gradle:
 * - Con Firebase válido: deja el plugin registrado (push en la barra).
 * - Sin Firebase: saca el plugin del APK. La app abre normal, WhatsApp sigue
 *   funcionando y la pantalla de avisos explica que falta configurarlo.
 */

const APP_ID = "cr.shoptogo.app";
const SERVICES_PATH = "android/app/google-services.json";
const PLUGINS_PATH = "android/app/src/main/assets/capacitor.plugins.json";
const PUSH_PACKAGE = "@capacitor/push-notifications";
const PUSH_CLASSPATH =
  "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";

type PluginEntry = {
  pkg: string;
  classpath: string;
};

type GoogleServices = {
  client?: Array<{
    client_info?: {
      mobilesdk_app_id?: string;
      android_client_info?: {
        package_name?: string;
      };
    };
    api_key?: Array<{ current_key?: string }>;
  }>;
};

function firebaseReadyForApp(raw: string) {
  let json: GoogleServices;
  try {
    json = JSON.parse(raw) as GoogleServices;
  } catch {
    return false;
  }

  const clients = Array.isArray(json.client) ? json.client : [];
  return clients.some((client) => {
    const packageName =
      client.client_info?.android_client_info?.package_name;
    const appId = client.client_info?.mobilesdk_app_id;
    const apiKey = client.api_key?.[0]?.current_key;
    return packageName === APP_ID && Boolean(appId) && Boolean(apiKey);
  });
}

async function readPlugins(): Promise<PluginEntry[]> {
  if (!existsSync(PLUGINS_PATH)) return [];
  try {
    const parsed = JSON.parse(await readFile(PLUGINS_PATH, "utf8"));
    return Array.isArray(parsed) ? (parsed as PluginEntry[]) : [];
  } catch {
    return [];
  }
}

async function main() {
  let enabled = false;
  let reason = `no existe ${SERVICES_PATH}`;

  if (existsSync(SERVICES_PATH)) {
    // Algunos editores guardan el archivo con BOM; no queremos que eso
    // desactive Firebase por error.
    const raw = (await readFile(SERVICES_PATH, "utf8")).replace(/^\uFEFF/, "");
    enabled = firebaseReadyForApp(raw);
    if (!enabled) {
      reason = `el google-services.json no tiene un cliente válido para ${APP_ID}`;
      // En GitHub Actions el archivo se generó recién: lo quitamos para que
      // Gradle no falle al aplicar el plugin de Google. En local no borramos
      // archivos del repositorio; el error de Gradle avisa qué corregir.
      if (process.env.GITHUB_ACTIONS) {
        await rm(SERVICES_PATH, { force: true });
      }
    }
  }

  const plugins = await readPlugins();
  const withoutPush = plugins.filter((plugin) => plugin.pkg !== PUSH_PACKAGE);
  const next = enabled
    ? [
        ...withoutPush,
        { pkg: PUSH_PACKAGE, classpath: PUSH_CLASSPATH },
      ]
    : withoutPush;

  await writeFile(PLUGINS_PATH, `${JSON.stringify(next, null, "\t")}\n`);

  if (enabled) {
    console.log(
      `Push nativo activado: Firebase está configurado para ${APP_ID}.`,
    );
  } else {
    console.log(
      `::warning::Push nativo desactivado (${reason}). La app abre igual y los avisos por WhatsApp siguen funcionando.`,
    );
  }
}

main().catch((error) => {
  console.error("No pudimos ajustar el push nativo de Android:", error);
  process.exitCode = 1;
});
