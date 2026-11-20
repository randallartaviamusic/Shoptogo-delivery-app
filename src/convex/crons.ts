import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// El local se abre y cierra solo según su horario: recalcular cada minuto
// mantiene alineados el interruptor, el directorio y los pedidos.
crons.interval(
  "actualizar horarios de atencion",
  { minutes: 1 },
  internal.businesses.syncOpenState,
  {},
);

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

// Recordatorio de pago: una semana antes del vencimiento se escribe al
// WhatsApp del negocio o repartidor. El cron revisa cada hora para no perder
// la ventana y no repetir el aviso del mismo período.
crons.interval(
  "recordatorios de pago whatsapp",
  { hours: 1 },
  internal.subscriptions.sendDueReminders,
  {},
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
