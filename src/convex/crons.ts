import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// El local se abre y cierra solo según su horario: recalcular cada minuto
// mantiene alineados el interruptor, el directorio y los pedidos.
crons.interval(
  "actualizar horarios de atencion",
  { minutes: 5 },
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
  { minutes: 5 },
  internal.notifications.dispatch,
  { limit: 20 },
);

// Difusión para compradores: el ciclo 3-5-2-4-1 horas alterna anuncios
// creativos con un producto destacado al azar. Revisa cada hora si toca.
crons.interval(
  "avisos creativos para compradores",
  { hours: 1 },
  internal.marketing.tickMarketing,
  {},
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

// Los favoritos del local tienen unos minutos de prioridad. Al vencer, esta
// tarea abre la entrega al resto de los repartidores disponibles.
crons.interval(
  "liberar prioridad de favoritos",
  { minutes: 5 },
  internal.orders.releaseFavoritePriorityOffers,
  {},
);

// Las ofertas duran pocos minutos: se cierran solas para que el tablero no
// muestre entregas que ya no están disponibles.
crons.interval(
  "cerrar ofertas vencidas",
  { minutes: 5 },
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
