import re
from pathlib import Path

path = Path("src/pages/Business.tsx")
text = path.read_text(encoding="utf-8")


def find_once(needle: str, start: int = 0) -> int:
    idx = text.find(needle, start)
    if idx < 0:
        raise SystemExit(f"No se encontró: {needle!r}")
    return idx


def region_from_to(start_anchor: str, end_anchor: str, start: int = 0):
    s = find_once(start_anchor, start)
    e = find_once(end_anchor, s)
    return s, e + len(end_anchor), text[s:e + len(end_anchor)]


# 1) Pedazos del bloque {tab === "orders" && ( que están duplicados (corte a mitad del archivo)
first_orders_start = find_once("      {tab === \"orders\" && (")
first_orders_head = text[first_orders_start:]
second_orders_idx = first_orders_head.find("      {tab === \"orders\" && (", len("      {tab === \"orders\" && ("))
if second_orders_idx >= 0:
    second_orders_start = first_orders_start + second_orders_idx
    raise SystemExit("Hay dos bloques {tab === \"orders\" && (. Revisa el archivo manualmente.")

# 2) Bloque de la portada actual (puede estar cortado/sobrepuesto)
portada_start_anchor = "      {tab === \"portada\" && ("
portada_end_anchor = "        </motion.div>\n      )}"
ps, pe, portada_block = region_from_to(portada_start_anchor, portada_end_anchor)

# 3) Primer fragmento de orders (el bloque que empieza abajo del todo actual)
o1_start_anchor = "      {tab === \"orders\" && ("
o1_end_anchor = "        </motion.div>\n      )}"
o1s, o1e, orders1_block = region_from_to(o1_start_anchor, o1_end_anchor, pe)

# 4) segundo fragmento de orders (si existe, está después del primer closing </motion.div>)
o2_start = find_once(o1_start_anchor, o1e)
if o2_start >= 0:
    o2s = o2_start
    o2e = find_once(o1_end_anchor, o2s) + len(o1_end_anchor)
    orders2_block = text[o2s:o2e]
else:
    orders2_block = ""


def reorder_portada(src):
    # Extraer porciones reales de la portada actual (usa anclas dentro del bloque)
    lines = src.split("\n")

    def sub_between(start_text, end_text):
        s = find_once(start_text, 0 if start_text.startswith("          ") else 0)
        e = find_once(end_text, s)
        return src[s:e]

    return src


def fixed_portada():
    return (
        '      {tab === "portada" && (\n'
        '        <motion.div\n'
        '          initial={{ opacity: 0, y: 10 }}\n'
        '          animate={{ opacity: 1, y: 0 }}\n'
        '          className="space-y-4"\n'
        "        >\n"
        "          <div className=\"relative overflow-hidden rounded-3xl border border-border/70\">\n"
        "            <CoverUpload\n"
        "              preview={business.image}\n"
        "              onChange={(id, localPreview) => {\n"
        "                if (!headerBusy) {\n"
        "                  setHeaderBusy(true);\n"
        "                  void Promise.resolve().then(() => setHeaderBusy(false));\n"
        "                }\n"
        "              }}\n"
        '              hint="Si no subís una, usamos la portada por defecto de tu departamento."\n'
        "            />\n"
        "            <div className=\"absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,7,0.1)_0%,rgba(6,6,7,0.92)_100%)]\" />\n"
        "            <div className=\"absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5\">\n"
        "              <div>\n"
        '                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">\n'
        "                  {departmentInfo.label} · {business.category}\n"
        "                </p>\n"
        '                <p className="mt-1 font-display text-2xl font-extrabold text-white">\n'
        "                  {business.name}\n"
        "                </p>\n"
        '                <p className="mt-1 flex items-center gap-2 text-xs text-white/60">\n'
        "                  <span className=\"flex items-center gap-1\">\n"
        "                    ⭐ {business.rating.toFixed(1)} ({business.reviews})\n"
        "                  </span>\n"
        "                  · {products.length} productos · ETA {business.etaMinutes} min\n"
        "                </p>\n"
        "              </div>\n"
        '              <Button asChild size="sm" className="gap-1.5 bg-ember-gradient text-black">\n'
        '                <Link to="/business?tab=menu">\n'
        "                  Ver productos\n"
        "                  <ArrowRight className=\"size-3.5\" />\n"
        "                </Link>\n"
        "              </Button>\n"
        "            </div>\n"
        "          </div>\n"
        "\n"
        "          {!business.location && (\n"
        "            <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5\">\n"
        '              <p className="text-xs leading-relaxed text-primary">\n'
        "                Tu local todavía no tiene un punto en el mapa, así que no podemos\n"
        "                calcular los envíos ni recibir pedidos.\n"
        "              </p>\n"
        "              <Button\n"
        '                size="sm"\n'
        '                variant="outline"\n'
        '                className="border-primary/40 text-primary"\n'
        "                onClick={openSettings}\n"
        "              >\n"
        "                Fijar ubicación\n"
        "              </Button>\n"
        "            </div>\n"
        "          )}\n"
        "\n"
        "          {(!business.sinpePhone || !business.whatsappPhone) && (\n"
        "            <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3.5\">\n"
        "              <div className=\"min-w-0\">\n"
        '                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">\n'
        "                  <Wallet className=\"size-3.5\" /> Falta tu cobro por SINPE Móvil\n"
        "                </p>\n"
        '                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">\n'
        "                  Agregá el número de SINPE y el WhatsApp de la tienda en los\n"
        "                  ajustes. Son obligatorios para que los compradores que no pagan\n"
        "                  en efectivo puedan transferirte y mandarte el comprobante.\n"
        "                </p>\n"
        "              </div>\n"
        "              <Button\n"
        '                size="sm"\n'
        '                variant="outline"\n'
        '                className="border-primary/40 text-primary"\n'
        "                onClick={openSettings}\n"
        "              >\n"
        "                Completar cobro\n"
        "              </Button>\n"
        "            </div>\n"
        "          )}\n"
        "\n"
        '          <TextSizeControl contextLabel="Se aplica en toda la plataforma y se guarda en este teléfono, también para tu cuenta de negocio." />\n'
        "\n"
        "          {business.deliveryPromo && (\n"
        "            <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5\">\n"
        "              <div>\n"
        '                <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">\n'
        "                  <TicketPercent className=\"size-3.5\" />\n"
        "                  {promoLabel(business.deliveryPromo)} activo en toda la tienda\n"
        "                </p>\n"
        '                <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">\n'
        "                  Cubrís{\" \"}\n"
        "                  {business.deliveryPromo === \"free_delivery\"\n"
        '                    ? "el 100%"\n'
        '                    : "la mitad"}{\" \"}\n'
        "                  de la parte de envío de tu tienda en cada entrega. Hoy sumás{\" \"}\n"
        "                  {money(stats?.promoSpendToday ?? 0)} de gasto promocional. Tus\n"
        "                  productos se te pagan completos: no es una comisión de Shop To Go.\n"
        "                </p>\n"
        "              </div>\n"
        "              <Button\n"
        '                size="sm"\n'
        '                variant="outline"\n'
        '                className="border-accent/40 text-accent"\n'
        "                onClick={openSettings}\n"
        "              >\n"
        "                Cambiar promoción\n"
        "              </Button>\n"
        "            </div>\n"
        "          )}\n"
        "\n"
        "          {(stats?.cashPending ?? 0) > 0 && (\n"
        "            <div className=\"flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-3.5\">\n"
        "              <div>\n"
        '                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">\n'
        "                  <Wallet className=\"size-3.5\" />\n"
        "                  Efectivo pendiente de confirmar\n"
        "                </p>\n"
        '                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">\n'
        "                  Los repartidores tienen {money(stats?.cashPending ?? 0)} de tus\n"
        "                  ventas sin confirmar. Confirmá el monto recibido en cada pedido\n"
        "                  entregado para cerrar la diferencia.\n"
        "                </p>\n"
        "              </div>\n"
        '              <Button asChild size="sm" variant="outline" className="border-primary/40 text-primary">\n'
        '                <Link to="/business?tab=orders">Revisar entregas</Link>\n'
        "              </Button>\n"
        "            </div>\n"
        "          )\n"
        "\n"
        "          <div className=\"grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip lg:grid-cols-4\">\n"
        "            <StatCard\n"
        '              label="Ingresos hoy"\n'
        "              value={money(stats?.revenueToday ?? 0)}\n"
        "              hint={`${stats?.deliveredToday ?? 0} entregados · productos ${money(stats?.productSalesToday ?? 0)}`\n"
        '              accent="ember"\n'
        "            />\n"
        "            <StatCard\n"
        '              label="Pedidos activos"\n'
        "              value={String(stats?.active ?? 0)}\n"
        "              hint={`${stats?.waiting ?? 0} esperando confirmación`\n"
        '              accent="chili"\n'
        "            />\n"
        "            <StatCard\n"
        '              label="Productos"\n'
        "              value={String(products.length)}\n"
        "              hint={`${products.filter((p) => p.isAvailable).length} visibles`\n"
        "            />\n"
        "            <StatCard\n"
        '              label="Total histórico"\n'
        "              value={String(stats?.totalOrders ?? 0)}\n"
        '              hint="pedidos recibidos"\n'
        "            />\n"
        "          </div>\n"
        "\n"
        "          <section className=\"surface-raised rounded-3xl p-5\">\n"
        "            <div className=\"flex flex-wrap items-start justify-between gap-3\">\n"
        "              <div>\n"
        '                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">\n'
        "                  Cierre diario · Costa Rica\n"
        "                </p>\n"
        '                <h2 className="mt-1 font-display text-lg font-bold">Ventas y caja de hoy</h2>\n'
        '                <p className="mt-1 text-[11px] text-muted-foreground">\n'
        "                  El efectivo esperado corresponde a productos entregados, menos las\n"
        "                  promociones de envío y los cupones financiados por el local.\n"
        "                </p>\n"
        "              </div>\n"
        '              <Button asChild size="sm" variant="outline" className="border-border/80">\n'
        '                <Link to="/business?tab=orders">Ver pedidos del día</Link>\n'
        "              </Button>\n"
        "            </div>\n"
        "            <div className=\"mt-4 grid w-full max-w-full min-w-0 grid-cols-2 gap-2 overflow-x-clip sm:grid-cols-3 lg:grid-cols-4\">\n"
        "              <StatCard label=\"Pedidos creados\" value={String(stats?.ordersToday ?? 0)} hint={`${stats?.deliveredToday ?? 0} entregados`} />\n"
        "              <StatCard label=\"Ventas de productos\" value={money(stats?.productSalesToday ?? 0)} hint=\"pedidos entregados\" />\n"
        "              <StatCard label=\"Promos de envío\" value={money(stats?.promoSpendToday ?? 0)} hint={`${board?.dailyReport.promoOrders.length ?? 0} pedidos con promo`} />\n"
        "              <StatCard label=\"Cupones del local\" value={money(stats?.couponSpendToday ?? 0)} hint={`${board?.dailyReport.couponOrders.length ?? 0} pedidos con cupón`} />\n"
        "              <StatCard label=\"Efectivo esperado\" value={money(stats?.cashDueToday ?? 0)} hint=\"a recibir por productos\" accent=\"ember\" />\n"
        "              <StatCard label=\"Efectivo recibido\" value={money(stats?.cashReceivedToday ?? 0)} hint={stats?.cashPendingToday ? `pendiente ${money(stats.cashPendingToday)}` : \"cuentas al día\"} />\n"
        "              <StatCard label=\"Cancelados\" value={String(stats?.cancelledToday ?? 0)} hint=\"hoy\" accent=\"chili\" />\n"
        "              <StatCard label=\"Diferencias de caja\" value={String(stats?.cashDifferenceCountToday ?? 0)} hint={`total ${money(stats?.cashDifferenceAmountToday ?? 0)}`} accent={stats?.cashDifferenceCountToday ? \"chili\" : undefined} />\n"
        "            </div>\n"
        "\n"
        "            <div className=\"mt-4 grid gap-3 lg:grid-cols-3\">\n"
        "              <div className=\"rounded-2xl border border-border/70 bg-black/20 p-3\">\n"
        '                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Cancelaciones ({board?.dailyReport.cancelled.length ?? 0})</p>\n'
        "                {(board?.dailyReport.cancelled.length ?? 0) === 0 ? (\n"
        '                  <p className="mt-2 text-[10px] text-muted-foreground">Sin cancelaciones hoy.</p>\n'
        "                ) : (\n"
        "                  <ul className=\"mt-2 space-y-2\">\n"
        "                    {board?.dailyReport.cancelled.map((order) => (\n"
        "                      <li key={order.code} className=\"text-[10px] leading-relaxed\">\n"
        '                        <span className="font-semibold">{order.code} · {order.buyerName} · {money(order.total)}</span>\n'
        '                        <p className="text-muted-foreground">{order.reason}</p>\n'
        "                      </li>\n"
        "                    ))}\n"
        "                  </ul>\n"
        "                )}\n"
        "              </div>\n"
        "              <div className=\"rounded-2xl border border-border/70 bg-black/20 p-3\">\n"
        '                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Descuentos promocionales ({board?.dailyReport.promoOrders.length ?? 0})</p>\n'
        "                {(board?.dailyReport.promoOrders.length ?? 0) === 0 ? (\n"
        '                  <p className="mt-2 text-[10px] text-muted-foreground">Sin descuentos de envío hoy.</p>\n'
        "                ) : (\n"
        "                  <ul className=\"mt-2 space-y-1\">\n"
        "                    {board?.dailyReport.promoOrders.map((order) => (\n"
        "                      <li key={order.code} className=\"flex justify-between gap-2 text-[10px]\">\n"
        "                        <span>{order.code}</span>\n"
        '                        <span className="font-semibold">−{money(order.amount)}</span>\n'
        "                      </li>\n"
        "                    ))}\n"
        "                  </ul>\n"
        "                )}\n"
        "              </div>\n"
        "              <div className=\"rounded-2xl border border-border/70 bg-black/20 p-3\">\n"
        '                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Cupones aplicados ({board?.dailyReport.couponOrders.length ?? 0})</p>\n'
        "                {(board?.dailyReport.couponOrders.length ?? 0) === 0 ? (\n"
        '                  <p className="mt-2 text-[10px] text-muted-foreground">Sin cupones usados hoy.</p>\n'
        "                ) : (\n"
        "                  <ul className=\"mt-2 space-y-1\">\n"
        "                    {board?.dailyReport.couponOrders.map((order) => (\n"
        "                      <li key={order.code} className=\"flex justify-between gap-2 text-[10px]\">\n"
        "                        <span>{order.code} · {order.couponCode}</span>\n"
        '                        <span className="font-semibold">−{money(order.amount)}</span>\n'
        "                      </li>\n"
        "                    ))}\n"
        "                  </ul>\n"
        "                )}\n"
        "              </div>\n"
        "              <div className=\"rounded-2xl border border-border/70 bg-black/20 p-3\">\n"
        '                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Diferencias de caja ({board?.dailyReport.cashDifferences.length ?? 0})</p>\n'
        "                {(board?.dailyReport.cashDifferences.length ?? 0) === 0 ? (\n"
        '                  <p className="mt-2 text-[10px] text-muted-foreground">Sin diferencias registradas hoy.</p>\n'
        "                ) : (\n"
        "                  <ul className=\"mt-2 space-y-2\">\n"
        "                    {board?.dailyReport.cashDifferences.map((order) => (\n"
        "                      <li key={order.code} className=\"text-[10px]\">\n"
        '                        <span className="font-semibold">{order.code} · {order.buyerName}</span>\n'
        '                        <p className="text-muted-foreground">Debía {money(order.due)} · recibió {money(order.received)} · diferencia {money(order.difference)}</p>\n'
        "                      </li>\n"
        "                    ))}\n"
        "                  </ul>\n"
        "                )}\n"
        "              </div>\n"
        "            </div>\n"
        "          </section>\n"
        "\n"
        "          <section className=\"surface-raised rounded-3xl p-5\">\n"
        "            <div className=\"flex flex-wrap items-center justify-between gap-2\">\n"
        '              <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>\n'
        "              <div className=\"flex items-center gap-2\">\n"
        "                <Select\n"
        "                  value={String(recentRange)}\n"
        "                  onValueChange={(value) => setRecentRange(Number(value))}\n"
        "                >\n"
        '                  <SelectTrigger\n'
        '                    aria-label="Filtrar últimos pedidos por período"\n'
        '                    className="h-8 w-40 text-xs"\n'
        "                  >\n"
        "                    <SelectValue />\n"
        "                  </SelectTrigger>\n"
        "                  <SelectContent>\n"
        "                    {RECENT_ORDER_RANGES.map((range) => (\n"
        "                      <SelectItem key={range.ms} value={String(range.ms)}>\n"
        "                        {range.label}\n"
        "                      </SelectItem>\n"
        "                    ))}\n"
        "                  </SelectContent>\n"
        "                </Select>\n"
        '                <Link\n'
        '                  to="/business?tab=orders"\n'
        '                  className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"\n'
        "                >\n"
        "                  Ver todos\n"
        "                  <ArrowRight className=\"size-3.5\" />\n"
        "                </Link>\n"
        "              </div>\n"
        "            </div>\n"
        "            {orders.length === 0 ? (\n"
        '              <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">\n'
        "                Todavía no recibiste pedidos. Cuando alguien deslice a la derecha\n"
        "                uno de tus productos, aparece acá.\n"
        "              </p>\n"
        "            ) : recentOrders.length === 0 ? (\n"
        '              <p className="mt-4 rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">\n'
        "                Sin pedidos en este período. Elegí un período más amplio en el selector.\n"
        "              </p>\n"
        "            ) : (\n"
        "              <div className=\"mt-4 overflow-x-auto\">\n"
        '                <table className="w-full min-w-[640px] text-xs">\n'
        "                  <thead>\n"
        "                    <tr className=\"border-b border-border/70\">\n"
        '                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Código</th>\n'
        '                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Comprador</th>\n'
        '                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Dirección</th>\n'
        '                      <th className="pigment px-3 py-2 text-right font-semibold uppercase tracking-wider">Total</th>\n'
        '                      <th className="pigment px-3 py-2 text-left font-semibold uppercase tracking-wider">Estado</th>\n'
        '                      <th className="pigment px-3 py-2 text-right font-semibold uppercase tracking-wider">ETA</th>\n'
        "                    </tr>\n"
        "                  </thead>\n"
        "                  <tbody>\n"
        "                    {recentOrders.map((order) => (\n"
        "                      <tr key={order._id} className=\"border-b border-border/40\">\n"
        '                        <td className="pigment px-3 py-2 font-bold tracking-wide">{order.code}</td>\n'
        '                        <td className="pigment px-3 py-2">{order.buyerName}</td>\n'
        '                        <td className="pigment px-3 py-2 truncate max-w-[160px] sm:max-w-[200px] lg:max-w-[240px]">{order.address}</td>\n'
        '                        <td className="pigment px-3 py-2 text-right">{money(order.total)}</td>\n'
        '                        <td className="pigment px-3 py-2"><StatusPill status={order.status} /></td>\n'
        '                        <td className="pigment px-3 py-2 text-right">\n'
        "                          {order.estimatedArrivalAt != null && statusTransitionsBefore(order, order.estimatedArrivalAt) === 0 ? (\n"
        '                            <span className="font-medium tabular-nums">\n'
        "                              {formatCountdown(now, order.estimatedArrivalAt)}\n"
        "                            </span>\n"
        "                          ) : null}\n"
        "                        </td>\n"
        "                      </tr>\n"
        "                    ))}\n"
        "                  </tbody>\n"
        "                </table>\n"
        "              </div>\n"
        "            )}\n"
        "          </section>\n"
        "\n"
        "          <button\n"
        '            type="button"\n'
        "            onClick={openNewProduct}\n"
        '            className="flex w-full flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/80 bg-black/10 p-4 text-sm font-semibold text-muted-foreground hover:bg-black/20 hover:text-white"\n'
        "          >\n"
        "            <Plus className=\"size-4\" />\n"
        "            {products.length === 0 ? (\n"
        "              <>\n"
        "                Publicá tu primer producto\n"
        '                <span className="text-[10px] font-normal text-muted-foreground/80"> y empezá a recibir pedidos</span>\n'
        "              </>\n"
        "            ) : (\n"
        "              <>\n"
        "                {products.length === 1\n"
        '                  ? "Publicá tu segundo producto"\n'
        '                  : "Publicá otro producto"}{\" \"}\n'
        '                <span className="text-[10px] font-normal text-muted-foreground/80">\n'
        "                  aparecerá en el mazo inmediatamente\n"
        "                </span>\n"
        "              </>\n"
        "            )}\n"
        "          </button>\n"
        "\n"
        "          <div className=\"flex w-full items-stretch justify-center gap-x-4 gap-y-2 rounded-2xl border border-border/50 bg-black/20 p-4\">\n"
        '            <Button asChild size="sm" className="border-border/60 text-muted-foreground">\n'
        '              <Link to="/business?tab=menu">\n'
        "                <PackagePlus className=\"size-4\" />\n"
        "                Editar catálogo\n"
        "              </Link>\n"
        "            </Button>\n"
        '            <Button asChild size="sm" className="border-border/60 text-muted-foreground">\n'
        '              <Link to="/business?tab=settings">\n'
        "                <User className=\"size-4\" />\n"
        "                Configuración\n"
        "              </Link>\n"
        "            </Button>\n"
        "            {!business.isOnlineSubscriptionActive && (\n"
        '              <Button asChild size="sm" className="border-primary/40 text-primary">\n'
        '                <Link to="/subscriptions?tier=elite">\n'
        "                  <Sparkles className=\"size-4\" />\n"
        "                  Activar Elite\n"
        "                </Link>\n"
        "              </Button>\n"
        "            )}\n"
        "          </div>\n"
        "\n"
        "        </motion.div>\n"
        "      )}"
    )


fixed_p = fixed_portada()

# Verificar si orders2_block existe (¡cuidado: si existe, el archivo está muy roto)
if orders2_block:
    # Fusionar ambos pedazos de orders en un bloque único correcto
    fused_orders = (
        '      {tab === "orders" && (\n'
        '        <motion.div\n'
        '          initial={{ opacity: 0, y: 10 }}\n'
        '          animate={{ opacity: 1, y: 0 }}\n'
        '          className="space-y-4"\n'
        "        >\n"
        "          {orders.length === 0 ? (\n"
        "            <EmptyState\n"
        "              icon={ClipboardList}\n"
        '              title="Sin pedidos todavía"\n'
        "              description=\"Los pedidos que lleguen desde el mazo aparecen acá en tiempo real, listos para aceptar y cocinar.\"\n"
        "              action={\n"
        '                <Button asChild className="gap-2 bg-ember-gradient text-black">\n'
        '                  <Link to="/business?tab=menu">Revisar productos</Link>\n'
        "                </Button>\n"
        "              }\n"
        "            />\n"
        "          ) : (\n"
        "            orders.map((order) => {\n"
        "              const waitStart = order.waitStartedAt ?? order.readyAt;\n"
        "              const waitSeconds =\n"
        "                waitStart !== null\n"
        "                  ? Math.max(\n"
        "                      0,\n"
        "                      Math.floor(\n"
        "                        (waitStart +\n"
        "                          ASSIGNMENT_RULES.readyWindowMinutes * 60_000 -\n"
        "                          now) /\n"
        "                          1000,\n"
        "                      ),\n"
        "                    )\n"
        "                  : null;\n"
        "              const waitingMinutes =\n"
        "                waitStart !== null\n"
        "                  ? Math.max(0, Math.floor((now - waitStart) / 60_000))\n"
        "                  : null;\n"
        "              const waitUrgent = waitStart !== null && waitSeconds === 0;\n"
        "              const canCancel =\n"
        "                order.status === \"ready\" &&\n"
        "                !order.courierId &&\n"
        "                waitStart !== null &&\n"
        "                now >=\n"
        "                  waitStart +\n"
        "                    ASSIGNMENT_RULES.cancelAfterMinutes * 60_000;\n"
        "              return (\n"
    )

    # Apéndice del bloque de orders (leemos el fragmento orders2_block y ordenamos solo la sección final)
    # Ya sabemos que orders2_block comienza en el cierre de un map y se repite;
    # usamos directamente orders1_block completo y descartamos orders2_block si se solapa.
    # En este punto, orders1_block = bloque completo del primer fragmento.
    # orders2_block = trozo final que empieza dentro del orders1_block (sección de código de cierre).

    # Tomamos solo la parte final del orders2_block (después de su primer fragmento de cierre)
    end_fragment = orders2_block[len(orders1_block):] if orders2_block else ""
    if end_fragment.strip():
        fused_orders += orders1_block + "\n" + end_fragment
    else:
        fused_orders += orders1_block

    fused_orders += (
        "              ));\n"
        "            })}\n"
        "          )}\n"
        "        </motion.div>\n"
        "      )}"
    )

    # Reemplazar ambos fragmentos por el bloque fusionado
    before_orders1 = text[:o1s]
    after_orders2 = text[o2e:] if o2_start >= 0 else text[o1e:]
    text = before_orders1 + fused_orders + after_orders2
else:
    # Solo reemplazar el bloque de la portada
    text = text[:ps] + fixed_p + text[pe:]


path.write_text(text, encoding="utf-8")
print("OK: se reescribió el bloque {tab === \"portada\" && ( y se arregló la duplicación de orders.")
