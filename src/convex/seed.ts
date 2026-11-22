import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { VERTICALS } from "./seedVerticals";
import { TILARAN_CENTER } from "../lib/delivery";

const img = (id: string, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const DEFAULT_DEPARTMENT = "comida";

/**
 * Los locales demo se reparten alrededor del centro de Tilarán para que el
 * cálculo de envío por distancia tenga datos reales.
 */
function demoLocation(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const angle = (hash % 360) * (Math.PI / 180);
  const radiusKm = 0.5 + ((hash >>> 9) % 260) / 100; // 0,5 a 3,1 km
  const lat = TILARAN_CENTER.lat + (radiusKm / 111) * Math.cos(angle);
  const lng =
    TILARAN_CENTER.lng +
    (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return {
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
  };
}

const toAttributes = (record: Record<string, string>) =>
  Object.entries(record).map(([key, value]) => ({ key, value }));

function foodTipo(category: string) {
  if (category === "Bebidas") return "Bebidas";
  if (["Postres", "Cajas", "Donuts", "Bakery"].includes(category)) {
    return "Postres";
  }
  if (["Acompañamientos", "Entradas", "Para compartir"].includes(category)) {
    return "Para compartir";
  }
  return "Principales";
}

/**
 * El filtro "Tipo de cocina" usa una taxonomía más amplia que el rubro del
 * local: varios rubros caen en un mismo tipo (hamburguesas y pollo frito son
 * comida rápida, por ejemplo).
 */
const CUISINE_BY_CATEGORY: Record<string, string> = {
  "Comida rápida": "Comida rápida",
  Pollo: "Comida rápida",
  Pizza: "Comida italiana",
  Pastas: "Comida italiana",
  Sushi: "Comida japonesa",
  "Comida japonesa": "Comida japonesa",
  "Comida asiática": "Comida japonesa",
  "Comida mexicana": "Comida mexicana",
  "Comida peruana": "Comida peruana",
  "Comida caribeña": "Comida caribeña",
  "Comida típica": "Comida típica",
  "Comida tradicional": "Comida casera o tradicional",
  "Comida casera": "Comida casera o tradicional",
  "Comida gourmet": "Comida gourmet",
  "Comida saludable": "Comida casera o tradicional",
  Postres: "Otra",
  Café: "Otra",
};

function cuisineFor(category: string) {
  return CUISINE_BY_CATEGORY[category] ?? "Otra";
}

/** Every food dish gets facet values so the deck filters work for comida too. */
function foodAttributes(category: string, tags: string[], cuisine: string) {
  const attributes: Array<{ key: string; value: string }> = [
    { key: "cocina", value: cuisineFor(cuisine) },
    { key: "tipo", value: foodTipo(category) },
    {
      key: "porcion",
      value: tags.some((tag) => tag === "Para compartir" || tag === "Para dos")
        ? "Para compartir"
        : "Para uno",
    },
  ];
  const diet = tags.find((tag) =>
    ["Vegano", "Vegetariano", "Vegetariana", "Sin lácteos", "Sin TACC"].includes(
      tag,
    ),
  );
  if (diet) {
    attributes.push({
      key: "dieta",
      value: diet === "Vegetariana" ? "Vegetariano" : diet,
    });
  }
  return attributes;
}

type SeedProduct = {
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  tags: string[];
};

type SeedBusiness = {
  name: string;
  slug: string;
  category: string;
  tagline: string;
  image: string;
  address: string;
  deliveryFee: number;
  etaMinutes: number;
  rating: number;
  reviews: number;
  products: SeedProduct[];
};

const catalog: SeedBusiness[] = [
  {
    name: "Brasa Negra",
    slug: "brasa-negra",
    category: "Comida rápida",
    tagline: "Carne al carbón, pan brioche y cero culpa",
    image: img("photo-1568901346375-23c9450c58cd"),
    address: "Av. Corrientes 1520, CABA",
    deliveryFee: 1900,
    etaMinutes: 28,
    rating: 4.9,
    reviews: 1284,
    products: [
      {
        name: "Doble Brasa Ahumada",
        description:
          "Dos medallones de 120g al carbón, cheddar añejo, cebolla caramelizada y mayo de carbón.",
        price: 12500,
        image: img("photo-1568901346375-23c9450c58cd"),
        category: "Comida rápida",
        tags: ["Más pedido", "Doble carne"],
      },
      {
        name: "Crispy Fire Chicken",
        description:
          "Pollo crujiente bañado en salsa picante de la casa, lechuga iceberg y pepinillos.",
        price: 10900,
        image: img("photo-1562967914-608f82629710"),
        category: "Comida rápida",
        tags: ["Picante", "Crujiente"],
      },
      {
        name: "Papas Trufadas",
        description:
          "Papas rústicas con aceite de trufa, parmesano y perejil fresco.",
        price: 6400,
        image: img("photo-1573080496219-bb080dd4f877"),
        category: "Acompañamientos",
        tags: ["Para compartir"],
      },
      {
        name: "Batido de Dulce de Leche",
        description:
          "Helado artesanal, dulce de leche repostero y crema batida.",
        price: 5200,
        image: img("photo-1572490122747-3968b75cc699"),
        category: "Bebidas",
        tags: ["Frío", "Dulce"],
      },
      {
        name: "Combo Brasa para Dos",
        description:
          "Dos hamburguesas clásicas, papas grandes y dos limonadas de la casa.",
        price: 22900,
        image: img("photo-1550547660-d9450f859349"),
        category: "Combos",
        tags: ["Ahorrás 15%", "Para dos"],
      },
    ],
  },
  {
    name: "Nonna Rossa",
    slug: "nonna-rossa",
    category: "Pizza",
    tagline: "Masa madre de 48 horas, horneada en piedra",
    image: img("photo-1513104890138-7c749659a591"),
    address: "Gorriti 4820, Palermo",
    deliveryFee: 1500,
    etaMinutes: 24,
    rating: 4.8,
    reviews: 892,
    products: [
      {
        name: "Pizza Pepperoni Nera",
        description:
          "Salsa de tomate San Marzano, mozzarella fior di latte y pepperoni ahumado.",
        price: 13400,
        image: img("photo-1513104890138-7c749659a591"),
        category: "Pizzas",
        tags: ["Clásica", "Favorita"],
      },
      {
        name: "Pizza Trufa y Hongos",
        description:
          "Crema de trufa, portobellos, mozzarella y aceite de oliva extra virgen.",
        price: 15600,
        image: img("photo-1571407970349-bc81e7e96d47"),
        category: "Pizzas",
        tags: ["Premium", "Vegetariana"],
      },
      {
        name: "Focaccia de Ajo",
        description: "Focaccia tibia con ajo asado, romero y sal marina.",
        price: 4800,
        image: img("photo-1573140247632-f8fd74997d5c"),
        category: "Entradas",
        tags: ["Para compartir"],
      },
      {
        name: "Tiramisú de la Nonna",
        description: "Bizcocho de café, mascarpone y cacao amargo.",
        price: 5900,
        image: img("photo-1571877227200-a0d98ea607e9"),
        category: "Postres",
        tags: ["Casero"],
      },
    ],
  },
  {
    name: "Kōri Sushi",
    slug: "kori-sushi",
    category: "Sushi",
    tagline: "Piezas de autor con pesca del día",
    image: img("photo-1579871494447-9811cf80d66c"),
    address: "Humboldt 2100, Palermo",
    deliveryFee: 2400,
    etaMinutes: 35,
    rating: 4.9,
    reviews: 2107,
    products: [
      {
        name: "Omakase 16 piezas",
        description:
          "Selección del itamae: nigiri de salmón, atún, langostino y rolls de la casa.",
        price: 28900,
        image: img("photo-1579871494447-9811cf80d66c"),
        category: "Sushi",
        tags: ["Chef's choice", "Para dos"],
      },
      {
        name: "Roll Fuego Amarillo",
        description:
          "Salmón, palta y mango con salsa de maracuyá y sésamo tostado.",
        price: 12900,
        image: img("photo-1617196034796-73dfa7b1fd56"),
        category: "Sushi",
        tags: ["Signature"],
      },
      {
        name: "Gyozas de Cerdo",
        description:
          "Seis gyozas selladas a la plancha con ponzu de cítricos.",
        price: 7400,
        image: img("photo-1496116218417-1a781b1c416c"),
        category: "Entradas",
        tags: ["Caliente"],
      },
      {
        name: "Ramen Tonkotsu",
        description:
          "Caldo de cerdo 12 horas, fideos frescos, huevo marinado y chashu.",
        price: 11800,
        image: img("photo-1569718212165-3a8278d5f624"),
        category: "Calientes",
        tags: ["Reconfortante"],
      },
    ],
  },
  {
    name: "El Fuego Taquería",
    slug: "el-fuego-taqueria",
    category: "Mexicana",
    tagline: "Tortillas hechas a mano y salsa que pica en serio",
    image: img("photo-1551504734-5ee1c4a1479b"),
    address: "Bulnes 1180, Almagro",
    deliveryFee: 1700,
    etaMinutes: 26,
    rating: 4.7,
    reviews: 1462,
    products: [
      {
        name: "Taco al Pastor",
        description:
          "Cerdo marinado en achiote, piña asada, cilantro y cebolla morada.",
        price: 3800,
        image: img("photo-1551504734-5ee1c4a1479b"),
        category: "Tacos",
        tags: ["Más pedido"],
      },
      {
        name: "Taco de Birria",
        description:
          "Res braseada 8 horas, queso fundido y consomé para mojar.",
        price: 4600,
        image: img("photo-1565299585323-38d6b0865b47"),
        category: "Tacos",
        tags: ["Nuevo", "Intenso"],
      },
      {
        name: "Nachos del Volcán",
        description:
          "Totopos, queso cheddar, jalapeños, guacamole y crema ácida.",
        price: 8900,
        image: img("photo-1513456852971-30c0b8199d4d"),
        category: "Para compartir",
        tags: ["Picante"],
      },
      {
        name: "Burrito Fuego",
        description:
          "Res, arroz, frijoles negros, queso y salsa habanera en tortilla de harina.",
        price: 9900,
        image: img("photo-1626700051175-6818013e1d4f"),
        category: "Burritos",
        tags: ["Contundente"],
      },
      {
        name: "Agua de Horchata",
        description: "Arroz, canela, vainilla y un toque de leche condensada.",
        price: 3400,
        image: img("photo-1544145945-f90425340c7e"),
        category: "Bebidas",
        tags: ["Refrescante"],
      },
    ],
  },
  {
    name: "Umami Ramen",
    slug: "umami-ramen",
    category: "Comida asiática",
    tagline: "Caldos que se cocinan mientras dormís",
    image: img("photo-1569718212165-3a8278d5f624"),
    address: "Junín 940, Recoleta",
    deliveryFee: 2100,
    etaMinutes: 32,
    rating: 4.8,
    reviews: 734,
    products: [
      {
        name: "Ramen Picante Umami",
        description:
          "Caldo miso rojo, fideos gruesos, cerdo, huevo ajitama y aceite de chili.",
        price: 12400,
        image: img("photo-1569718212165-3a8278d5f624"),
        category: "Ramen",
        tags: ["Picante", "Favorito"],
      },
      {
        name: "Bao de Pollo Karaage",
        description:
          "Dos bollos al vapor con pollo crujiente, mayo japonesa y encurtidos.",
        price: 7900,
        image: img("photo-1617093727343-374698b1b08d"),
        category: "Entradas",
        tags: ["Para compartir"],
      },
      {
        name: "Pad Thai de Langostinos",
        description:
          "Fideos de arroz, tamarindo, maní tostado y langostinos salteados.",
        price: 13600,
        image: img("photo-1559314809-0d155014e29e"),
        category: "Wok",
        tags: ["Sin lácteos"],
      },
      {
        name: "Mochi de Matcha",
        description: "Tres mochis rellenos de helado de matcha.",
        price: 4900,
        image: img("photo-1563805042-7684c019e1cb"),
        category: "Postres",
        tags: ["Dulce"],
      },
    ],
  },
  {
    name: "Azúcar Glaseada",
    slug: "azucar-glaseada",
    category: "Postres",
    tagline: "Donuts recién glaseadas cada 40 minutos",
    image: img("photo-1551024506-0bccd828d307"),
    address: "Costa Rica 5900, Palermo",
    deliveryFee: 1300,
    etaMinutes: 18,
    rating: 4.9,
    reviews: 3231,
    products: [
      {
        name: "Donut Glaseada Clásica",
        description:
          "Masa brioche, glaseado de vainilla de Madagascar y azúcar perlada.",
        price: 2600,
        image: img("photo-1551024506-0bccd828d307"),
        category: "Donuts",
        tags: ["Recién hecha"],
      },
      {
        name: "Donut Pistacho y Frambuesa",
        description:
          "Relleno de frambuesa, crema de pistacho y crumble de la casa.",
        price: 3200,
        image: img("photo-1533910534207-90f31029a78e"),
        category: "Donuts",
        tags: ["Edición limitada"],
      },
      {
        name: "Caja de 6 Surtidas",
        description:
          "Seis donuts elegidas por el pastelero, ideal para compartir.",
        price: 14900,
        image: img("photo-1551024601-bec78aea704b"),
        category: "Cajas",
        tags: ["Para compartir", "Ahorrás 10%"],
      },
      {
        name: "Cheesecake Basco",
        description:
          "Porción de cheesecake quemado con centro cremoso y sal marina.",
        price: 6800,
        image: img("photo-1533134242443-d4fd215305ad"),
        category: "Postres",
        tags: ["Premium"],
      },
      {
        name: "Café Cold Brew",
        description: "Extracción en frío de 18 horas, servido con hielo.",
        price: 3600,
        image: img("photo-1517701550927-30cf4ba1dba5"),
        category: "Bebidas",
        tags: ["Sin azúcar"],
      },
    ],
  },
  {
    name: "Verde Vivo",
    slug: "verde-vivo",
    category: "Comida saludable",
    tagline: "Bowls que te dejan liviano y con energía",
    image: img("photo-1512621776951-a57141f2eefd"),
    address: "Billinghurst 1345, Palermo",
    deliveryFee: 1600,
    etaMinutes: 22,
    rating: 4.6,
    reviews: 512,
    products: [
      {
        name: "Bowl Poke Salmón",
        description:
          "Salmón fresco, arroz sushi, palta, edamame, mango y salsa ponzu.",
        price: 11200,
        image: img("photo-1546069901-ba9599a7e63c"),
        category: "Bowls",
        tags: ["Alto en proteína"],
      },
      {
        name: "Bowl Mediterráneo",
        description:
          "Quinoa, garbanzos crocantes, hummus, tomate y vinagreta de limón.",
        price: 9400,
        image: img("photo-1512621776951-a57141f2eefd"),
        category: "Bowls",
        tags: ["Vegano"],
      },
      {
        name: "Smoothie Tropical",
        description: "Mango, maracuyá, banana y leche de coco.",
        price: 4200,
        image: img("photo-1505252585461-04db1eb84625"),
        category: "Bebidas",
        tags: ["Sin lácteos"],
      },
      {
        name: "Wrap de Pollo Grillado",
        description:
          "Tortilla integral, pollo grillado, lechuga, tomate y yogurt de hierbas.",
        price: 7900,
        image: img("photo-1626700051175-6818013e1d4f"),
        category: "Wraps",
        tags: ["Ligero"],
      },
    ],
  },
  {
    name: "Café Medianoche",
    slug: "cafe-medianoche",
    category: "Café",
    tagline: "Café de especialidad y madrugadas largas",
    image: img("photo-1509042239860-f550ce710b93"),
    address: "Serrano 780, Villa Crespo",
    deliveryFee: 1100,
    etaMinutes: 15,
    rating: 4.8,
    reviews: 986,
    products: [
      {
        name: "Latte Medianoche",
        description:
          "Doble espresso, leche texturizada y un hilo de jarabe de vainilla.",
        price: 3900,
        image: img("photo-1509042239860-f550ce710b93"),
        category: "Café",
        tags: ["Favorito"],
      },
      {
        name: "Croissant de Almendras",
        description:
          "Hojaldre de manteca relleno de crema de almendras y laminado tostado.",
        price: 4300,
        image: img("photo-1555507036-ab1f4038808a"),
        category: "Bakery",
        tags: ["Recién horneado"],
      },
      {
        name: "Avocado Toast",
        description:
          "Pan de masa madre, palta, huevo poché, semillas y aceite de oliva.",
        price: 7200,
        image: img("photo-1541519227354-08fa5d50c44d"),
        category: "Brunch",
        tags: ["Proteico"],
      },
      {
        name: "Iced Matcha",
        description: "Matcha ceremonial batido en frío con leche de avena.",
        price: 4500,
        image: img("photo-1515823064-d6e0c04616a7"),
        category: "Bebidas",
        tags: ["Vegano"],
      },
    ],
  },
  {
    name: "Pollo Bravo",
    slug: "pollo-bravo",
    category: "Pollo",
    tagline: "Crochet que se escucha cuando repartimos",
    image: img("photo-1562967914-608f82629710"),
    address: "Rivadavia 4820, Caballito",
    deliveryFee: 2000,
    etaMinutes: 30,
    rating: 4.7,
    reviews: 1587,
    products: [
      {
        name: "Balde Bravo 8 piezas",
        description:
          "Ocho presas marinadas 24 horas, rebozado extra crocante y dip bravo.",
        price: 19900,
        image: img("photo-1562967914-608f82629710"),
        category: "Pollo",
        tags: ["Para compartir", "Más pedido"],
      },
      {
        name: "Sándwich Crispy Hot",
        description:
          "Pechuga crocante, mayonesa de chipotle, lechuga y pan de papa.",
        price: 9700,
        image: img("photo-1606755962773-d324e0a13086"),
        category: "Sándwiches",
        tags: ["Picante"],
      },
      {
        name: "Aros de Cebolla",
        description: "Aros rebozados en cerveza con dip de miel y mostaza.",
        price: 5400,
        image: img("photo-1639024471283-03518883512d"),
        category: "Acompañamientos",
        tags: ["Crujiente"],
      },
      {
        name: "Coleslaw Fresco",
        description: "Repollo, zanahoria y aderezo cremoso con un toque cítrico.",
        price: 3200,
        image: img("photo-1512852939750-1305098529bf"),
        category: "Acompañamientos",
        tags: ["Fresco"],
      },
    ],
  },
  {
    name: "La Pasta Madre",
    slug: "la-pasta-madre",
    category: "Pasta",
    tagline: "Pastas frescas como las de la abuela",
    image: img("photo-1621996346565-e3dbc646d9a9"),
    address: "Paraguay 2200, Recoleta",
    deliveryFee: 1800,
    etaMinutes: 27,
    rating: 4.8,
    reviews: 648,
    products: [
      {
        name: "Cacio e Pepe",
        description:
          "Tonarelli frescos, pecorino romano y pimienta negra recién molida.",
        price: 11800,
        image: img("photo-1621996346565-e3dbc646d9a9"),
        category: "Pasta",
        tags: ["Clásico romano"],
      },
      {
        name: "Ravioles de Ricota y Nuez",
        description:
          "Rellenos a mano, manteca de salvia y nueces tostadas.",
        price: 12600,
        image: img("photo-1551183053-bf91a1d81141"),
        category: "Pasta",
        tags: ["Vegetariana", "Casero"],
      },
      {
        name: "Lasagna Boloñesa",
        description:
          "Siete capas de ragú de res, bechamel y parmesano gratinado.",
        price: 13900,
        image: img("photo-1574894709920-11b28e7367e3"),
        category: "Pasta",
        tags: ["Contundente"],
      },
      {
        name: "Burrata con Tomates",
        description:
          "Burrata entera, tomates confitados, albahaca y pan de masa madre.",
        price: 9800,
        image: img("photo-1608897013039-887f21d8c804"),
        category: "Entradas",
        tags: ["Premium"],
      },
    ],
  },
];

async function insertCatalog(ctx: MutationCtx) {
  let productCount = 0;
  for (const entry of catalog) {
    const businessId = await ctx.db.insert("businesses", {
      name: entry.name,
      slug: entry.slug,
      department: DEFAULT_DEPARTMENT,
      category: entry.category,
      tagline: entry.tagline,
      image: entry.image,
      address: entry.address,
      location: demoLocation(entry.slug),
      deliveryFee: entry.deliveryFee,
      etaMinutes: entry.etaMinutes,
      rating: entry.rating,
      reviews: entry.reviews,
      isOpen: true,
      isDemo: true,
    });
    for (const product of entry.products) {
      await ctx.db.insert("products", {
        businessId,
        department: DEFAULT_DEPARTMENT,
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image,
        category: product.category,
        attributes: foodAttributes(
          product.category,
          product.tags,
          entry.category,
        ),
        tags: product.tags,
        isAvailable: true,
        isDemo: true,
      });
      productCount += 1;
    }
  }
  await ctx.db.insert("meta", { key: "whimy_catalog", value: "v1" });
  return productCount;
}

async function insertVerticals(ctx: MutationCtx) {
  let productCount = 0;
  for (const entry of VERTICALS) {
    const businessId = await ctx.db.insert("businesses", {
      name: entry.name,
      slug: entry.slug,
      department: entry.department,
      category: entry.category,
      tagline: entry.tagline,
      image: entry.image,
      address: entry.address,
      location: demoLocation(entry.slug),
      deliveryFee: entry.deliveryFee,
      etaMinutes: entry.etaMinutes,
      rating: entry.rating,
      reviews: entry.reviews,
      isOpen: true,
      isDemo: true,
    });
    for (const product of entry.products) {
      await ctx.db.insert("products", {
        businessId,
        department: entry.department,
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.image,
        category: product.category,
        attributes: toAttributes(product.attributes),
        tags: product.tags,
        isAvailable: true,
        isDemo: true,
      });
      productCount += 1;
    }
  }
  return productCount;
}

/** Tags the original food catalog with departments + facets (one-time upgrade). */
async function tagLegacyCatalog(ctx: MutationCtx) {
  const businesses = await ctx.db.query("businesses").collect();
  for (const business of businesses) {
    if (!business.isDemo) continue;
    if (!business.department) {
      await ctx.db.patch(business._id, { department: DEFAULT_DEPARTMENT });
    }
  }
  const products = await ctx.db.query("products").collect();
  for (const product of products) {
    if (!product.isDemo) continue;
    if (product.department && product.attributes) continue;
    const business = await ctx.db.get(product.businessId);
    const department =
      product.department ?? business?.department ?? DEFAULT_DEPARTMENT;
    const attributes =
      product.attributes && product.attributes.length > 0
        ? product.attributes
        : department === DEFAULT_DEPARTMENT
          ? foodAttributes(
              product.category,
              product.tags,
              business?.category ?? "Comida",
            )
          : [];
    await ctx.db.patch(product._id, { department, attributes });
  }
}

/**
 * One-time upgrade: pasa los platos del catálogo demo a la nueva taxonomía de
 * tipos de cocina sin tocar el resto de sus atributos.
 */
async function upgradeFoodFacets(ctx: MutationCtx) {
  const businesses = await ctx.db.query("businesses").collect();
  const byId = new Map(businesses.map((business) => [business._id, business]));
  const products = await ctx.db.query("products").collect();
  let updated = 0;
  for (const product of products) {
    if (!product.isDemo) continue;
    const business = byId.get(product.businessId);
    const department = product.department ?? business?.department;
    if (!business || department !== DEFAULT_DEPARTMENT) continue;

    const cuisine = cuisineFor(business.category);
    const current = product.attributes ?? [];
    if (current.some((attribute) => attribute.key === "cocina" && attribute.value === cuisine)) {
      continue;
    }
    await ctx.db.patch(product._id, {
      attributes: [
        { key: "cocina", value: cuisine },
        ...current.filter((attribute) => attribute.key !== "cocina"),
      ],
    });
    updated += 1;
  }
  return updated;
}

/** One-time: ubica en el mapa a los locales demo que todavía no tienen punto. */
async function backfillLocations(ctx: MutationCtx) {
  const businesses = await ctx.db.query("businesses").collect();
  let updated = 0;
  for (const business of businesses) {
    if (!business.isDemo || business.location) continue;
    await ctx.db.patch(business._id, { location: demoLocation(business.slug) });
    updated += 1;
  }
  return updated;
}

async function findMeta(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** Idempotent: fills the app with the demo catalog the first time it runs. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    let products = 0;
    const foodMarker = await findMeta(ctx, "whimy_catalog");
    if (!foodMarker) products += await insertCatalog(ctx);

    const verticalsMarker = await findMeta(ctx, "whimy_catalog_verticals");
    if (!verticalsMarker) {
      await tagLegacyCatalog(ctx);
      products += await insertVerticals(ctx);
      await ctx.db.insert("meta", {
        key: "whimy_catalog_verticals",
        value: "v1",
      });
    }

    const locationsMarker = await findMeta(ctx, "whimy_catalog_locations");
    if (!locationsMarker) {
      await backfillLocations(ctx);
      await ctx.db.insert("meta", {
        key: "whimy_catalog_locations",
        value: "v1",
      });
    }

    const facetsMarker = await findMeta(ctx, "whimy_catalog_cuisines");
    if (!facetsMarker) {
      await upgradeFoodFacets(ctx);
      await ctx.db.insert("meta", {
        key: "whimy_catalog_cuisines",
        value: "v2",
      });
    }

    return { seeded: products > 0, products };
  },
});

/** Used by `convex run seed:reset` to force a rebuild of the demo catalog. */
export const reset = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (!args.force) return { seeded: false, products: 0 };
    const demoBusinesses = await ctx.db.query("businesses").collect();
    for (const business of demoBusinesses) {
      if (!business.isDemo) continue;
      const products = await ctx.db
        .query("products")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect();
      for (const product of products) await ctx.db.delete(product._id);
      await ctx.db.delete(business._id);
    }
    const markers = await ctx.db.query("meta").collect();
    for (const marker of markers) {
      if (marker.key.startsWith("whimy_catalog")) {
        await ctx.db.delete(marker._id);
      }
    }
    const products = (await insertCatalog(ctx)) + (await insertVerticals(ctx));
    await ctx.db.insert("meta", { key: "whimy_catalog_verticals", value: "v1" });
    return { seeded: true, products };
  },
});
