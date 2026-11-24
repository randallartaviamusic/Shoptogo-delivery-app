/**
 * Servicios adicionales de pago único para cuentas de negocio.
 * Los valores iniciales viven acá; el administrador los puede editar, quitar
 * o reemplazar desde su panel (tabla `extraServices`).
 */

export const EXTRA_SERVICE_ICONS = [
  "camera",
  "images",
  "megaphone",
  "printer",
  "sparkles",
  "store",
  "bike",
  "gift",
] as const;

export type ExtraServiceIcon = (typeof EXTRA_SERVICE_ICONS)[number];

export type ExtraServiceDraft = {
  name: string;
  headline: string;
  price: number;
  details: string[];
  icon: string;
};

export const DEFAULT_EXTRA_SERVICES: ExtraServiceDraft[] = [
  {
    name: "Tienda lista con 10 productos",
    headline: "Ideal si no tenés tiempo",
    price: 10000,
    icon: "camera",
    details: [
      "Un colaborador de Shop To Go configura el perfil de tu tienda.",
      "Publica 10 productos de tu tienda en la plataforma.",
      "Incluye tomar las fotos de los productos en tu local.",
    ],
  },
  {
    name: "Tienda lista con hasta 40 productos",
    headline: "Para catálogos grandes",
    price: 25000,
    icon: "images",
    details: [
      "Un colaborador de Shop To Go configura el perfil de tu tienda.",
      "Publica desde 11 hasta 40 productos de tu tienda en la plataforma.",
      "Incluye tomar las fotos de los productos en tu local.",
    ],
  },
  {
    name: "Publicidad en redes por 1 día",
    headline: "Que todos se enteren",
    price: 10000,
    icon: "megaphone",
    details: [
      "Promoción paga (ads) de 1 día en las redes sociales de Shop To Go.",
      "Anunciamos tu tienda para que las personas sepan que pueden comprar por medio de la app.",
    ],
  },
  {
    name: "Material publicitario para tu local",
    headline: "Tu tienda física también vende",
    price: 10000,
    icon: "printer",
    details: [
      "1 afiche grande para pegar en tu tienda física.",
      "18 stickers con el código QR de la plataforma.",
    ],
  },
];

export function isExtraServiceIcon(value: string): value is ExtraServiceIcon {
  return (EXTRA_SERVICE_ICONS as readonly string[]).includes(value);
}
