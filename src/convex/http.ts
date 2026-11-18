import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { confirmPayment } from "./paymentWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

// Los proveedores de pago confirman la transferencia acá (firma HMAC). Así la
// suscripción se activa sin que una persona revise cada comprobante.
http.route({
  path: "/subscriptions/payment",
  method: "POST",
  handler: confirmPayment,
});

export default http;
