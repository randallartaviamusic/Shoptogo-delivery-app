import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App Android de Shop To Go.
 *
 * El APK incluye los assets de `dist` (no abre la web publicada) y usa el
 * backend de Convex por HTTPS. El identificador no se puede cambiar después de
 * publicar el APK: las actualizaciones deben conservar el mismo.
 */
const config: CapacitorConfig = {
  appId: "cr.shoptogo.app",
  appName: "Shop To Go",
  webDir: "dist",
  backgroundColor: "#0a0a0b",
  android: {
    backgroundColor: "#0a0a0b",
    allowMixedContent: false,
  },
  server: {
    // Origen local seguro (https://localhost) para que localStorage, auth y
    // las rutas funcionen igual que en la web.
    androidScheme: "https",
  },
};

export default config;
