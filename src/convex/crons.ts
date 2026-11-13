import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Un pedido listo que nadie toma no puede quedar esperando para siempre: a la
// hora se cancela solo, además de la cancelación manual del local a los 30 min.
crons.interval(
  "cancelar pedidos listos sin repartidor",
  { minutes: 5 },
  internal.orders.autoCancelStaleReady,
);

// Avisos fuera de la app: la cola se vacía cada minuto para que el WhatsApp
// llegue mientras el pedido todavía está caliente.
crons.interval(
  "despachar avisos de WhatsApp",
  { minutes: 1 },
  internal.notifications.dispatch,
  { limit: 20 },
);

// Las ofertas duran pocos minutos: se cierran solas para que el tablero no
// muestre entregas que ya no están disponibles.
crons.interval(
  "cerrar ofertas vencidas",
  { minutes: 2 },
  internal.orders.expireOffers,
  {},
);

// La bandeja de avisos se poda a los 30 días: sirve para revisar un reclamo,
// no para guardar mensajes para siempre.
crons.daily(
  "podar avisos enviados",
  { hourUTC: 8, minuteUTC: 20 },
  internal.notifications.prune,
  { days: 30 },
);

export default crons;
