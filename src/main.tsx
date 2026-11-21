import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, lazy, Suspense, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useLocation } from "react-router";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const SwipePage = lazy(() => import("./pages/Swipe.tsx"));
const BusinessesPage = lazy(() => import("./pages/Businesses.tsx"));
const CartPage = lazy(() => import("./pages/Cart.tsx"));
const OrdersPage = lazy(() => import("./pages/Orders.tsx"));
const FavoritesPage = lazy(() => import("./pages/Favorites.tsx"));
const ProfilePage = lazy(() => import("./pages/Profile.tsx"));
const BusinessPage = lazy(() => import("./pages/Business.tsx"));
const CourierPage = lazy(() => import("./pages/Courier.tsx"));
const SubscriptionPage = lazy(() => import("./pages/Subscription.tsx"));
const HelpPage = lazy(() => import("./pages/Help.tsx"));
const ReceiptPage = lazy(() => import("./pages/Receipt.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Cargando...</div>
    </div>
  );
}

/**
 * Ya no hay cuentas de invitado. Si en este navegador quedó abierta una sesión
 * anónima de antes, la cerramos para que la persona entre con su cuenta.
 */
function LegacyGuestCleanup() {
  const { isLoading, user, signOut } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || isLoading || !user?.isAnonymous) return;
    handled.current = true;
    signOut().catch(() => undefined);
  }, [isLoading, user, signOut]);

  return null;
}

class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
    // Si lo que falló fue un chunk viejo, la recarga resuelve el problema.
    if (
      /dynamically imported module|loading chunk|importing a module script failed/i.test(
        err.message,
      )
    ) {
      reloadForStaleChunk();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Error en la vista previa</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background"
            >
              Recargar la app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

/**
 * Cada despliegue cambia el hash de los chunks. Una pestaña abierta desde
 * antes puede pedir un chunk que ya no existe: el servidor devuelve el
 * index.html y el import dinámico falla. Recargamos una vez para entrar en la
 * versión nueva en vez de dejar al comprador con un error al confirmar.
 */
const CHUNK_RELOAD_AT = "shop-to-go:chunk-reload-at";

function reloadForStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_AT) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_AT, String(Date.now()));
  } catch {
    // Sin almacenamiento no podemos evitar un bucle de recargas: mostramos el
    // error con el botón para que la persona recargue a mano.
    return;
  }
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});

// El service worker es quien muestra la notificación con la app cerrada. Se
// registra siempre, pero sólo recibe push quien active los avisos en su local.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker la app funciona igual, sólo se pierden los avisos */
    });
  });
}

function RouteSyncer() {
  const location = useLocation();
  const savedPath = useRef<string | null>(null);

  if (savedPath.current !== location.pathname) {
    savedPath.current = location.pathname;
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <LegacyGuestCleanup />
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/swipe" replace />} />
              <Route path="/bienvenida" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/profile" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth redirectImmediately>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth
                    redirectImmediately
                    title="Entrá con tu cuenta de negocio"
                    description="Cargá los datos de tu local desde la cuenta de negocio con la que te registraste."
                  >
                    <Onboarding />
                  </RequireAuth>
                }
              />
              {/* La sección de antojo es pública: se abre el mazo sin cuenta.
                  Cada acción que guarda algo (carrito, pedidos, guardados,
                  perfil) pide crear cuenta o iniciar sesión. */}
              <Route element={<AppShell />}>
                <Route path="/swipe" element={<SwipePage />} />
                <Route path="/negocios" element={<BusinessesPage />} />
                <Route path="/negocios/:slug" element={<BusinessesPage />} />
                <Route
                  path="/cart"
                  element={
                    <RequireAuth redirectImmediately>
                      <CartPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <RequireAuth redirectImmediately>
                      <OrdersPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/favorites"
                  element={
                    <RequireAuth redirectImmediately>
                      <FavoritesPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <RequireAuth redirectImmediately>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/business"
                  element={
                    <RequireAuth
                      title="Entrá a tu perfil de negocio"
                      description="Registrate con tu correo y contraseña o iniciá sesión en tu cuenta para gestionar tu local."
                    >
                      <BusinessPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/courier"
                  element={
                    <RequireAuth
                      title="Entrá a tu perfil de repartidor"
                      description="Registrate con tu correo y contraseña o iniciá sesión en tu cuenta para tomar entregas."
                    >
                      <CourierPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/suscripcion"
                  element={
                    <RequireAuth
                      redirectImmediately
                      title="Entrá a tu cuenta"
                      description="La suscripción es para cuentas de negocio y repartidor."
                    >
                      <SubscriptionPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/ayuda"
                  element={
                    <RequireAuth redirectImmediately>
                      <HelpPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/comprobante/:orderId"
                  element={
                    <RequireAuth redirectImmediately>
                      <ReceiptPage />
                    </RequireAuth>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster theme="dark" position="top-center" richColors />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
