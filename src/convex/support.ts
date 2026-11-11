import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminEmail } from "./branding";
import { supportCategoryValidator, supportStatusValidator } from "./schema";

type DbCtx = QueryCtx | MutationCtx;

async function requireAdmin(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Necesitás iniciar sesión");
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Sólo el perfil administrador puede gestionar la ayuda");
  }
  return user;
}

async function canAccessOrder(
  ctx: DbCtx,
  userId: Id<"users">,
  order: Doc<"orders">,
) {
  if (order.buyerId === userId || order.courierId === userId) return true;
  const business = await ctx.db.get(order.businessId);
  return business?.ownerId === userId;
}

/** Abre un caso de ayuda para pagos, productos, dirección o entrega. */
export const create = mutation({
  args: {
    category: supportCategoryValidator,
    message: v.string(),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Necesitás iniciar sesión");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Esa cuenta ya no existe");

    const message = args.message.trim();
    if (message.length < 10) {
      throw new Error("Contanos un poco más: al menos 10 caracteres");
    }
    if (message.length > 1200) {
      throw new Error("El mensaje es demasiado largo (máximo 1200 caracteres)");
    }
    if (args.orderId) {
      const order = await ctx.db.get(args.orderId);
      if (!order) throw new Error("Ese pedido no existe");
      if (!(await canAccessOrder(ctx, userId, order))) {
        throw new Error("Ese pedido no está asociado a tu cuenta");
      }
    }

    const now = Date.now();
    const ticketId = await ctx.db.insert("supportTickets", {
      userId,
      role: user.role,
      orderId: args.orderId,
      category: args.category,
      message,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return { ticketId };
  },
});

/** Casos de la cuenta que está mirando, con la respuesta del administrador. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { tickets: [], openCount: 0 };
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const sorted = tickets.sort((a, b) => b.updatedAt - a.updatedAt);
    const rows = [];
    for (const ticket of sorted.slice(0, 20)) {
      const order = ticket.orderId ? await ctx.db.get(ticket.orderId) : null;
      rows.push({
        _id: ticket._id,
        category: ticket.category,
        message: ticket.message,
        status: ticket.status,
        adminNote: ticket.adminNote ?? null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt ?? null,
        orderId: ticket.orderId ?? null,
        orderCode: order?.code ?? null,
      });
    }
    return {
      tickets: rows,
      openCount: tickets.filter((ticket) => ticket.status !== "resolved").length,
    };
  },
});

/** Cola de ayuda para el perfil administrador. */
export const adminList = query({
  args: {
    status: v.optional(supportStatusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("supportTickets").collect();
    const users = await ctx.db.query("users").collect();
    const businesses = await ctx.db.query("businesses").collect();
    const userById = new Map(users.map((user) => [user._id, user]));
    const businessByOwner = new Map(
      businesses
        .filter((business) => business.ownerId)
        .map((business) => [business.ownerId!, business]),
    );
    const term = (args.search ?? "").trim().toLowerCase();

    const rows = [];
    for (const ticket of all) {
      if (args.status && ticket.status !== args.status) continue;
      const user = userById.get(ticket.userId);
      const business = businessByOwner.get(ticket.userId);
      const order = ticket.orderId ? await ctx.db.get(ticket.orderId) : null;
      const searchable = [
        user?.name,
        user?.email,
        user?.phone,
        business?.name,
        order?.code,
        ticket.message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (term && !searchable.includes(term)) continue;
      rows.push({
        _id: ticket._id,
        userId: ticket.userId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        role: user?.role ?? null,
        businessName: business?.name ?? null,
        orderCode: order?.code ?? null,
        category: ticket.category,
        message: ticket.message,
        status: ticket.status,
        adminNote: ticket.adminNote ?? null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt ?? null,
      });
    }
    rows.sort(
      (a, b) =>
        Number(a.status === "resolved") - Number(b.status === "resolved") ||
        b.updatedAt - a.updatedAt,
    );

    return {
      tickets: rows.slice(0, 60),
      totals: {
        open: all.filter((ticket) => ticket.status === "open").length,
        inReview: all.filter((ticket) => ticket.status === "in_review").length,
        resolved: all.filter((ticket) => ticket.status === "resolved").length,
      },
    };
  },
});

/** Responder, marcar en revisión o resolver un caso. */
export const adminUpdate = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    status: supportStatusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ese caso ya no existe");
    const note = args.note?.trim() || undefined;
    if (args.status === "resolved" && !note && !ticket.adminNote) {
      throw new Error("Escribí una respuesta antes de resolver el caso");
    }
    const now = Date.now();
    await ctx.db.patch(ticket._id, {
      status: args.status,
      adminNote: note ?? ticket.adminNote,
      updatedAt: now,
      resolvedAt: args.status === "resolved" ? now : undefined,
      resolvedBy: args.status === "resolved" ? admin._id : undefined,
    });
    return { status: args.status };
  },
});
