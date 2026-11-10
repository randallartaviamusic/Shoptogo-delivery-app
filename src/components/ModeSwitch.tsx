import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Flame, Store } from "lucide-react";
import { useNavigate } from "react-router";

export type ExploreMode = "antojo" | "negocios";

const MODES: Array<{
  value: ExploreMode;
  label: string;
  hint: string;
  icon: typeof Flame;
  to: string;
}> = [
  {
    value: "antojo",
    label: "Modo antojo",
    hint: "Deslizá productos al azar",
    icon: Flame,
    to: "/swipe",
  },
  {
    value: "negocios",
    label: "Modo negocios",
    hint: "Entrá al local y comprá su catálogo",
    icon: Store,
    to: "/negocios",
  },
];

/** Tocar el nombre del modo abre el cambio al otro modo. */
export function ModeSwitch({ mode, suffix }: { mode: ExploreMode; suffix?: string }) {
  const navigate = useNavigate();
  const current = MODES.find((item) => item.value === mode) ?? MODES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1.5 rounded-full text-accent outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {current.label}
          {suffix ? ` · ${suffix}` : ""}
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-64 border-border/80 bg-popover p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Cambiar de modo
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/70" />
        {MODES.map((item) => {
          const Icon = item.icon;
          const active = item.value === mode;
          return (
            <DropdownMenuItem
              key={item.value}
              onSelect={() => navigate(item.to)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg px-2 py-2 focus:bg-secondary/60",
                active && "bg-accent/[0.08]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-accent/15 text-accent" : "bg-secondary text-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold normal-case tracking-normal">
                  {item.label}
                  {active && <Check className="size-3.5 text-accent" />}
                </span>
                <span className="mt-0.5 block text-[11px] font-normal normal-case leading-snug tracking-normal text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
