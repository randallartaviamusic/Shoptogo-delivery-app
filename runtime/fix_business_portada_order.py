import re
from pathlib import Path


path = Path("src/pages/Business.tsx")
src = path.read_text(encoding="utf-8")


def find_first(needle: str, start: int = 0) -> int:
    idx = src.find(needle, start)
    if idx < 0:
        raise SystemExit(f"Punto de anclaje no encontrado: {needle!r}")
    return idx


def region(end_anchor: str, start: int, inclusive: bool = False) -> tuple[int, str]:
    end = find_first(end_anchor, start) + (len(end_anchor) if inclusive else len(end_anchor))
    return end, src[start:end]


# 1) El bloque completo del <motion.div> de la portada
portada_start = find_first('      {tab === "portada" && (')
sect_open = find_first("        <motion.div\n", portada_start)
section_close = find_first("        </motion.div>\n      )}", sect_open)
portada_block = src[sect_open:section_close + len("        </motion.div>\n      )}")]


# 2) Extraer cada subbloque por su marca de inicio
head = portada_block.index("        >") + len("        >")

# Bloque de portada visual (termina donde empieza la primera sección de stats/grid)
stats_grid_start_marker = "          <div className=\"grid w-full max-w-full min-w-0 grid-cols-2"
cover_block_end, cover_block_raw = region(stats_grid_start_marker, head)
cover_block = cover_block_raw.rstrip().strip()

# Stats grid (4 cards): empieza en el marcador anterior, termina antes del bloque de ubicación faltante
loc_marker_start = "{!business.location && ("
loc_start_search = cover_block_end
loc_end_marker = ") }\n\n          {(!business.sinpePhone"
stats_grid_end, stats_grid_raw = region(loc_end_marker, loc_start_search)
stats_grid = stats_grid_raw.strip()

# Bloque de ubicación faltante
sinpe_marker = ") }\n\n          {(!business.sinpePhone || !business.whatsappPhone) && ("
sinpe_start_search = stats_grid_end
sinpe_end_marker = ") }\n\n          <TextSizeControl"
loc_block_end, loc_block_raw = region(sinpe_end_marker, loc_start_search)
loc_block = loc_block_raw.strip()

# Bloque SINPE/WhatsApp
ts_marker = "<TextSizeControl "
ts_search = sinpe_marker_end = loc_block_end
ts_end_marker = "/>\n\n          {business.deliveryPromo && ("
_sinpe_block_end, sinpe_block_raw = region(null if False else ts_end_marker, find_first(ts_marker, find_first(sinpe_marker)))
sinpe_block = sinpe_block_raw.strip()

# TextSizeControl
promo_marker = "{business.deliveryPromo && ("
promo_search = find_first(ts_end_marker) + len(ts_end_marker)
promo_end_marker = ") }\n\n          {(stats?.cashPending ?? 0) > 0 && ("
ps_end, promo_block_raw = region(promo_end_marker, find_first(promo_marker, find_first(ts_end_marker)))
promo_block = promo_block_raw.strip()

# Promoción de envío
cash_marker = "(stats?.cashPending ?? 0) > 0 && ("
cash_search = ps_end
cash_end_marker = ") }\n\n         Section className=\"surface-raised rounded-3xl p-5\""
cash_end_search = find_first(cash_end_marker, find_first(cash_marker, cash_search))
cash_block_raw = src[find_first(cash_marker, cash_search):cash_end_search]
cash_block = cash_block_raw.strip()

# Cierre diario
sales_section_marker = "          <section className=\"surface-raised rounded-3xl p-5\">"
sales_start = find_first(sales_section_marker, cash_end_search)
sales_end_marker = "          </section>\n\n          <div className=\"surface-raised rounded-3xl p-5\">"
sales_end_search = find_first(sales_end_marker, sales_start)

# Últimos pedidos (reconstruido desde encabezado hasta cierre; asume bloque limpio)
recent_orders_marker = "          <div className=\"surface-raised rounded-3xl p-5\">\n            <div className=\"flex flex-wrap items-center justify-between gap-2\">\n              <h2 className=\"font-display text-lg font-bold\">Últimos pedidos</h2>"
recent_start = find_first(recent_orders_marker, sales_end_search)
recent_end_marker = "          </div>\n\n          <button"
recent_end_search = find_first(recent_end_marker, recent_start)
recent_orders_block = src[recent_start:recent_end_search]

# Botón publicar producto nuevo
pub_marker = "<button\n            onClick={openNewProduct}"
pub_start = find_first(pub_marker, recent_end_search)
pub_end_marker = "</button>\n        </motion.div>"
pub_end = find_first(pub_end_marker, pub_start) + len("</button>")
pub_button = src[pub_start:pub_end]


def dedent1(region: str) -> str:
    first = region.splitlines()[0]
    indent = len(first) - len(first.lstrip(" "))
    if indent <= 0:
        return region
    return "\n".join(line[indent:] for line in region.splitlines())


new_portada_body = (
    "        >\n"
    f"{dedent1(cover_block)}\n\n"
    f"{dedent1(stats_grid)}\n\n"
    f"{dedent1(loc_block)}\n\n"
    f"{dedent1(sinpe_block)}\n\n"
    f"{dedent1(promo_block)}\n\n"
    f"{dedent1(cash_block)}\n\n"
    "          <section className=\"surface-raised rounded-3xl p-5\">\n"
    f"{src[sales_start + len(sales_section_marker):sales_end_search].rstrip()}\n"
    "          </section>\n\n"
    f"{dedent1(recent_orders_block)}\n\n"
    f"{dedent1(pub_button)}\n"
    "        </motion.div>\n"
    "      )}"
)


pattern = re.compile(
    r"        <motion\.div\n"
    r"          initial=\{\{ opacity: 0, y: 10 \}\}\n"
    r"          animate=\{\{ opacity: 1, y: 0 \}\}\n"
    r"          className=\"space-y-4\"\n"
    r".*?"
    r"        </motion\.div>\n"
    r"      \}\)",
    re.DOTALL,
)


fixed = pattern.sub(new_portada_body, src)
if fixed == src:
    raise SystemExit("No se pudo reemplazar el motion.div de la portada (patrón no coincide).")


path.write_text(fixed, encoding="utf-8")
print("OK")

