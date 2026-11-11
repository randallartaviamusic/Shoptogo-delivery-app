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

export default crons;
