import re
from pathlib import Path
from typing import Any

path = Path("src/pages/Business.tsx")
src = path.read_text(encoding="utf-8")

PORTADA_START = '      {tab === "portada" && ('
SECTION_START = '        <motion.div\n'
SECTION_ANIM = '          initial={{ opacity: 0, y: 10 }}\n'
SECTION_ANIM2 = '          animate={{ opacity: 1, y: 0 }}\n'
SECTION_CLASS = '          className="space-y-4"\n'
SECTION_OPEN = '        >'

COVER_BLOCK_END = '          </div>\n\n          {!business.location && ('
STATS_GRID_START = '          <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 overflow-x-clip lg:grid-cols-4">'
STATS_GRID_END = '          </div>\n\n          {!business.location && ('
ORDERS_SECTION_START = '          <section className="surface-raised rounded-3xl p-5">'
ORDERS_SECTION_END = '          </section>\n\n          <div className="surface-raised rounded-3xl p-5">'
RECENT_ORDERS_HEAD = '          <div className="surface-raised rounded-3xl p-5">\n            <div className="flex flex-wrap items-center justify-between gap-2">\n              <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>'
RECENT_ORDERS_BLOCK_START = '            {orders.length === 0 ? ('
RECENT_ORDERS_BLOCK_END = '          </div>\n\n          <button'

CLOSE_MOTION = '        </motion.div>\n      )}'

errors_seen: list[str] = []


def _find_index(value: str, start: int = 0) -> int:
    idx = src.find(value, start)
    if idx < 0:
        errors_seen.append(f"No se encontró: {value!r}")
        raise ValueError(f"Punto de anclaje no encontrado: {value!r}")
    return idx


def _extract_region(start_anchor: str, end_anchor: str, start_search: int) -> tuple[int, int, str]:
    start = _find_index(start_anchor, start_search)
    end = _find_index(end_anchor, start + len(start_anchor))
    return start, end + len(end_anchor), src[start:end]


# 1) Encuentra el bloque entero del motion.div de la portada.
start_search = src.find(PORTADA_START)
if start_search < 0:
    raise SystemExit("No se encontró la sección portada para reordenar.")

portada_start = _find_index(SECTION_START, start_search)
portada_section_end = _find_index(CLOSE_MOTION, portada_start)
portada_block = src[portada_start:portada_section_end + len(CLOSE_MOTION)]

# 2) Extrae los subbloques de la portada para reordenar.
#    Orden deseado:
#      - portada visual (cover block)
#      - stats grid (4 cards)
#      - bloque de ubicación faltante
#      - bloque de SINPE/WhatsApp faltante
#      - TextSizeControl
#      - promo
#      - cash pending
#      - bloque de cierre diario (Ventas y caja de hoy)
#      - últimos pedidos
#      - botón "Publicar un producto nuevo"
cover_block_start = _find_index(COVER_BLOCK_END, portada_section_end - len(CLOSE_MOTION) - 1000)
cover_block = src[portada_start + len(SECTION_OPEN):cover_block_start]
cover_block = cover_block.strip()

stats_grid_start = _find_index(STATS_GRID_START, cover_block_start + len(COVER_BLOCK_END))
stats_grid_end = _find_index(STATS_GRID_END, stats_grid_start)
stats_grid = src[stats_grid_start:stats_grid_end]

location_block_start = _find_index("{!business.location && (", stats_grid_end)
location_block_end = _find_index(") }\n\n          {(!business.sinpePhone || !business.whatsappPhone) && (", location_block_start)
location_block = src[location_block_start:location_block_end]

sinpe_block_start = _find_index("(!business.sinpePhone || !business.whatsappPhone) && (", location_block_end)
sinpe_block_end = _find_index(") }\n\n          <TextSizeControl", sinpe_block_start)
sinpe_block = src[sinpe_block_start:sinpe_block_end]

textsize_block_start = _find_index("<TextSizeControl ", sinpe_block_end)
textsize_block_end = _find_index("/>\n\n          {business.deliveryPromo && (", textsize_block_start)
textsize_block = src[textsize_block_start:textsize_block_end]

promo_block_start = _find_index("{business.deliveryPromo && (", textsize_block_end)
promo_block_end = _find_index(") }\n\n          {(stats?.cashPending ?? 0) > 0 && (", promo_block_start)
promo_block = src[promo_block_start:promo_block_end]

cash_block_start = _find_index("(stats?.cashPending ?? 0) > 0 && (", promo_block_end)
cash_block_end = _find_index(") }\n\n          <section className=\"surface-raised rounded-3xl p-5\">", cash_block_start)
cash_block = src[cash_block_start:cash_block_end]

daily_section_start = _find_index('<section className="surface-raised rounded-3xl p-5">', cash_block_end)
daily_section_end = _find_index('          </section>\n\n          <div className="surface-raised rounded-3xl p-5">', daily_section_start)
daily_section = src[daily_section_start:daily_section_end]

recent_orders_start = _find_index('          <div className="surface-raised rounded-3xl p-5">\n            <div className="flex flex-wrap items-center justify-between gap-2">\n              <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>', daily_section_end)
recent_orders_end = _find_index('          </div>\n\n          <button', recent_orders_start)
recent_orders_block = src[recent_orders_start:recent_orders_end]

pub_button_start = _find_index("<button\n            onClick={openNewProduct}", recent_orders_end)
pub_button_end = _find_index("</button>\n        </motion.div>", pub_button_start) + len("</button>")
pub_button = src[pub_button_start:pub_button_end]


def _dedent_outer(region: str) -> str:
    lines = region.splitlines()
    if not lines:
        return region
    indent = len(lines[0]) - len(lines[0].lstrip(" "))
    if indent <= 0:
        return region
    return "\n".join(line[indent:] for line in lines)


new_portada_body = "\n".join(
    [
        SECTION_OPEN.strip(),
        _dedent_outer(cover_block),
        "",
        _dedent_outer(stats_grid),
        "",
        _dedent_outer(location_block),
        "",
        _dedent_outer(sinpe_block),
        "",
        _dedent_outer(textsize_block),
        "",
        _dedent_outer(promo_block),
        "",
        _dedent_outer(cash_block),
        "",
        _dedent_outer(daily_section),
        "",
        _dedent_outer(recent_orders_block),
        "",
        _dedent_outer(pub_button),
        "",
        CLOSE_MOTION.strip(),
    ]
).strip()

# Elimina el bloque de "Últimos pedidos" corrupto que tiene los pedidos renderizados dos veces
# y lo reemplaza por el bloque extraído de forma limpia.
corrupt_pattern = re.compile(
    r"          <div className=\"surface-raised rounded-3xl p-5\">\n"
    r"            <div className=\"flex flex-wrap items-center justify-between gap-2\">\n"
    r"              <h2 className=\"font-display text-lg font-bold\">Últimos pedidos</h2>\n"
    r".*?"
    r"          </div>\n\n          <button",
    re.DOTALL,
)

replaced = corrupt_pattern.sub(lambda _: new_portada_body, src)
if replaced == src:
    raise SystemExit("No se pudo reemplazar el bloque de la portada; el patrón no coincide.")

# Vuelve a calcular la región del motion.div de la portada después del reemplazo.
new_start = replaced.find(PORTADA_START)
new_section_start = replaced.find(SECTION_START, new_start)
section_close_anchor = "        </motion.div>\n      )}"
new_section_close = replaced.find(section_close_anchor, new_section_start)
new_motion_block = replaced[new_section_start:new_section_close + len(section_close_anchor)]

# Normaliza la estructura de la portada: un único motion.div con espacio interno limpio.
clean_motion = (
    "      {tab === \"portada\" && (\n"
    "        <motion.div\n"
    "          initial={{ opacity: 0, y: 10 }}\n"
    "          animate={{ opacity: 1, y: 0 }}\n"
    "          className=\"space-y-4\"\n"
    "        >\n"
    + new_portada_body
    + "\n"
    "        </motion.div>\n"
    "      )}"
)

replaced2 = replaced[:new_section_start] + clean_motion + replaced[new_section_close + len(section_close_anchor):]

if replaced2.count("</motion.div>") != replaced.count("</motion.div>"):
    raise SystemExit("Se corrompió el balance de motion.div durante la edición.")

path.write_text(replaced2, encoding="utf-8")
print("OK: se reordenó la portada del negocio y se limpió el bloque de últimos pedidos.")
