/**
 * Opciones que el negocio agrega a un producto: sabor, tipo, ingredientes o
 * acompañamientos. El comprador elige una o varias al agregarlo al carrito y
 * el precio adicional se suma al precio base.
 */

export type ProductOption = {
  id: string;
  name: string;
  /** Colones extra. 0 = sin costo adicional. */
  price: number;
  /** Para grupos de varios: viene marcada por defecto. */
  defaultSelected?: boolean;
};

export type ProductOptionGroup = {
  id: string;
  name: string;
  /** single = elegir una; multi = elegir varias. */
  kind: "single" | "multi";
  required: boolean;
  options: ProductOption[];
};

export type ProductOptionChoice = {
  groupId: string;
  optionId: string;
};

export type SelectedProductOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
};

const MAX_GROUPS = 8;
const MAX_OPTIONS_PER_GROUP = 20;
const MAX_NAME_LENGTH = 60;
const MAX_OPTION_PRICE = 500_000;

function cleanPrice(value: number) {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(MAX_OPTION_PRICE, Math.max(0, rounded));
}

function cleanText(value: string | undefined, fallback: string) {
  return (value ?? "").trim().slice(0, MAX_NAME_LENGTH) || fallback;
}

/**
 * Deja las opciones en una forma segura y acotada. Se usa al guardar desde el
 * panel del negocio y al leer productos viejos.
 */
export function normalizeOptionGroups(
  groups: ProductOptionGroup[] | undefined | null,
): ProductOptionGroup[] {
  const normalized: ProductOptionGroup[] = [];

  for (const [groupIndex, group] of (groups ?? []).entries()) {
    if (normalized.length >= MAX_GROUPS) break;
    const kind = group.kind === "multi" ? "multi" : "single";
    const name = cleanText(group.name, `Opción ${normalized.length + 1}`);
    let groupId = cleanText(group.id, `g${groupIndex + 1}`);
    while (normalized.some((entry) => entry.id === groupId)) {
      groupId = `${groupId}-${groupIndex + 1}`;
    }

    const options: ProductOption[] = [];
    for (const [optionIndex, option] of (group.options ?? []).entries()) {
      if (options.length >= MAX_OPTIONS_PER_GROUP) break;
      const optionName = cleanText(option.name, "");
      if (!optionName) continue;

      let optionId = cleanText(option.id, `o${optionIndex + 1}`);
      while (options.some((entry) => entry.id === optionId)) {
        optionId = `${optionId}-${optionIndex + 1}`;
      }

      options.push({
        id: optionId,
        name: optionName,
        price: cleanPrice(option.price),
        ...(kind === "multi" && option.defaultSelected
          ? { defaultSelected: true }
          : {}),
      });
    }

    if (options.length === 0) continue;
    normalized.push({
      id: groupId,
      name,
      kind,
      // Elegir uno siempre deja una opción seleccionada. En los grupos de
      // varios, el negocio decide si es obligatorio.
      required: kind === "single" ? true : Boolean(group.required),
      options,
    });
  }

  return normalized;
}

/** Opciones que el comprador ve marcadas al abrir el producto. */
export function defaultChoices(
  groups: ProductOptionGroup[] | undefined | null,
): ProductOptionChoice[] {
  const choices: ProductOptionChoice[] = [];
  for (const group of groups ?? []) {
    if (group.options.length === 0) continue;
    if (group.kind === "single") {
      const preferred =
        group.options.find((option) => option.defaultSelected) ?? group.options[0];
      choices.push({ groupId: group.id, optionId: preferred.id });
    } else {
      for (const option of group.options) {
        if (option.defaultSelected) {
          choices.push({ groupId: group.id, optionId: option.id });
        }
      }
    }
  }
  return choices;
}

/** Cambia una opción respetando si el grupo es de una o de varias. */
export function toggleChoice(
  groups: ProductOptionGroup[],
  choices: ProductOptionChoice[],
  groupId: string,
  optionId: string,
): ProductOptionChoice[] {
  const group = groups.find((entry) => entry.id === groupId);
  if (!group) return choices;

  if (group.kind === "single") {
    return [
      ...choices.filter((choice) => choice.groupId !== groupId),
      { groupId, optionId },
    ];
  }

  const exists = choices.some(
    (choice) => choice.groupId === groupId && choice.optionId === optionId,
  );
  return exists
    ? choices.filter(
        (choice) =>
          !(choice.groupId === groupId && choice.optionId === optionId),
      )
    : [...choices, { groupId, optionId }];
}

/** Clave estable para distinguir dos variantes del mismo producto. */
export function choiceKey(choices: ProductOptionChoice[] = []): string {
  const unique = new Set(
    choices.map((choice) => `${choice.groupId}:${choice.optionId}`),
  );
  return [...unique].sort().join("|") || "base";
}

export type ValidatedChoices =
  | {
      ok: true;
      choices: ProductOptionChoice[];
      selected: SelectedProductOption[];
      extra: number;
    }
  | { ok: false; error: string };

/** Valida la selección contra el producto y arma la foto que se guarda. */
export function validateChoices(
  groups: ProductOptionGroup[] | undefined | null,
  choices: ProductOptionChoice[] | undefined | null,
): ValidatedChoices {
  const groupList = groups ?? [];
  const groupById = new Map(groupList.map((group) => [group.id, group]));
  const chosenByGroup = new Map<string, Set<string>>();

  for (const choice of choices ?? []) {
    const group = groupById.get(choice.groupId);
    if (!group) {
      return { ok: false, error: "Una opción del producto ya no está disponible" };
    }
    const option = group.options.find((entry) => entry.id === choice.optionId);
    if (!option) {
      return { ok: false, error: "Una opción del producto ya no está disponible" };
    }

    const set = chosenByGroup.get(group.id) ?? new Set<string>();
    if (group.kind === "single" && set.size > 0 && !set.has(option.id)) {
      return { ok: false, error: `Elegí una sola opción en ${group.name}` };
    }
    set.add(option.id);
    chosenByGroup.set(group.id, set);
  }

  const selected: SelectedProductOption[] = [];
  for (const group of groupList) {
    const chosen = chosenByGroup.get(group.id) ?? new Set<string>();
    if (group.kind === "single" && chosen.size !== 1) {
      return { ok: false, error: `Elegí ${group.name.toLowerCase()}` };
    }
    if (group.kind === "multi" && group.required && chosen.size === 0) {
      return { ok: false, error: `Elegí al menos una opción en ${group.name}` };
    }

    for (const option of group.options) {
      if (!chosen.has(option.id)) continue;
      selected.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        price: cleanPrice(option.price),
      });
    }
  }

  const extra = selected.reduce((sum, option) => sum + option.price, 0);
  return {
    ok: true,
    choices: selected.map((option) => ({
      groupId: option.groupId,
      optionId: option.optionId,
    })),
    selected,
    extra,
  };
}

/** Texto corto para el carrito y los pedidos. */
export function optionSummary(
  selected: SelectedProductOption[] | undefined | null,
): string {
  const byGroup = new Map<string, string[]>();
  for (const option of selected ?? []) {
    const names = byGroup.get(option.groupName) ?? [];
    names.push(option.optionName);
    byGroup.set(option.groupName, names);
  }
  return [...byGroup.entries()]
    .map(([group, names]) => `${group}: ${names.join(", ")}`)
    .join(" · ");
}

/** Suma de los adicionales elegidos. */
export function extrasTotal(
  selected: SelectedProductOption[] | undefined | null,
): number {
  return (selected ?? []).reduce((sum, option) => sum + option.price, 0);
}
