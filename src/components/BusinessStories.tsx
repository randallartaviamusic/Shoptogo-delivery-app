import { cn } from "@/lib/utils";
import { Pause, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

export type StoryFeedItem = {
  _id: string;
  kind: "image" | "video";
  url: string;
  caption?: string | null;
  ctaKind?: "local" | "product" | "offer";
  ctaProductId?: string;
  createdAt: number;
  expiresAt: number;
};

export type StoryFeedGroup = {
  businessId: string;
  name: string;
  slug: string;
  image: string;
  stories: StoryFeedItem[];
};

type Position = { business: number; story: number };

const SEEN_KEY = "shop-to-go:seen-stories";
const IMAGE_MS = 5000;
const TAP_MS = 220;

function loadSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
}

function timeAgo(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return "hace 1 d";
}

function StoryViewer({
  groups,
  position,
  onPositionChange,
  onClose,
  onSeen,
}: {
  groups: StoryFeedGroup[];
  position: Position;
  onPositionChange: (position: Position) => void;
  onClose: () => void;
  onSeen: (storyId: string) => void;
}) {
  const group = groups[position.business];
  const story = group?.stories[position.story];
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pressStart = useRef(0);

  useEffect(() => {
    setProgress(0);
    setPaused(false);
    if (story) onSeen(story._id);
  }, [group?.businessId, story?._id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || story?.kind !== "video") return;
    if (paused) {
      video.pause();
    } else {
      video.play().catch(() => undefined);
    }
  }, [paused, story?._id]);

  useEffect(() => {
    if (!story || story.kind !== "image" || paused) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const value = (Date.now() - started) / IMAGE_MS;
      if (value >= 1) {
        window.clearInterval(timer);
        goNext();
      } else {
        setProgress(value);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [story?._id, paused, position.business, position.story]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!group || !story) return null;

  const goNext = () => {
    if (position.story + 1 < group.stories.length) {
      onPositionChange({ business: position.business, story: position.story + 1 });
    } else if (position.business + 1 < groups.length) {
      onPositionChange({ business: position.business + 1, story: 0 });
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (position.story > 0) {
      onPositionChange({ business: position.business, story: position.story - 1 });
    } else if (position.business > 0) {
      const previous = groups[position.business - 1];
      onPositionChange({
        business: position.business - 1,
        story: Math.max(0, previous.stories.length - 1),
      });
    } else {
      setProgress(0);
    }
  };

  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95">
      <div
        className="relative h-full w-full touch-none overflow-hidden bg-black select-none sm:h-[85vh] sm:w-auto sm:aspect-[9/16] sm:rounded-2xl sm:border sm:border-white/10"
        onPointerDown={(event) => {
          pressStart.current = Date.now();
          setPaused(true);
        }}
        onPointerUp={(event) => {
          const held = Date.now() - pressStart.current;
          setPaused(false);
          if (held < TAP_MS) {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < rect.width * 0.3) goPrev();
            else goNext();
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {story.kind === "video" ? (
          <video
            key={story._id}
            ref={videoRef}
            src={story.url}
            autoPlay
            muted={muted}
            playsInline
            preload="auto"
            className="absolute inset-0 size-full object-cover"
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) {
                setProgress(
                  Math.min(1, video.currentTime / Math.max(1, video.duration)),
                );
              }
            }}
            onEnded={goNext}
          />
        ) : (
          <img
            key={story._id}
            src={story.url}
            alt={story.caption || `Historia de ${group.name}`}
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-2 top-2 flex gap-1">
          {group.stories.map((item, index) => (
            <div
              key={item._id}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <div
                className="h-full bg-white"
                style={{
                  width: `${
                    index < position.story
                      ? 100
                      : index === position.story
                        ? Math.round(progress * 100)
                        : 0
                  }%`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 top-4 flex items-center gap-2 px-2.5">
          <img
            src={group.image}
            alt={group.name}
            className="size-8 shrink-0 rounded-full border border-white/30 object-cover"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-white">
              {group.name}
            </p>
            <p className="text-[11px] text-white/70">{timeAgo(story.createdAt)}</p>
          </div>
          {story.kind === "video" && (
            <button
              type="button"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={(event) => {
                event.stopPropagation();
                setMuted((value) => !value);
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/45 text-white"
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          )}
          <button
            type="button"
            aria-label="Cerrar historias"
            onPointerDown={stop}
            onPointerUp={stop}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/45 text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {paused && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white">
            <Pause className="size-5" />
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          {story.caption && (
            <p className="mb-2 text-[13px] leading-snug text-white">
              {story.caption}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Link
              to={
                story.ctaKind === "product" && story.ctaProductId
                  ? `/negocios/${group.slug}?producto=${story.ctaProductId}`
                  : story.ctaKind === "offer"
                    ? `/negocios/${group.slug}?oferta=1`
                    : `/negocios/${group.slug}`
              }
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={onClose}
              className="flex h-10 w-full items-center justify-center rounded-full bg-white text-[13px] font-bold text-black"
            >
              {story.ctaKind === "product"
                ? "Ver producto"
                : story.ctaKind === "offer"
                  ? "Ver oferta"
                  : "Ver local"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fila de historias sobre el directorio: avatar con aro si hay algo nuevo y
 * visor de pantalla completa con avance automático, pausa al mantener y
 * zonas táctiles para ir atrás o adelante.
 */
export function StoriesTray({ groups }: { groups: StoryFeedGroup[] }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>(loadSeen);

  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // Sin almacenamiento, las historias igual se pueden ver.
    }
  }, [seen]);

  if (groups.length === 0) return null;

  const markSeen = (storyId: string) => {
    setSeen((current) =>
      current[storyId] ? current : { ...current, [storyId]: Date.now() },
    );
  };

  const openBusiness = (business: number) => {
    const stories = groups[business]?.stories ?? [];
    const firstNew = stories.findIndex((story) => !seen[story._id]);
    setPosition({ business, story: firstNew === -1 ? 0 : firstNew });
  };

  return (
    <>
      <section aria-label="Historias de locales">
        <div className="-mx-4 mb-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0">
          {groups.map((group, index) => {
            const hasNew = group.stories.some((story) => !seen[story._id]);
            return (
              <button
                key={group.businessId}
                type="button"
                onClick={() => openBusiness(index)}
                className="flex w-16 shrink-0 flex-col items-center gap-1"
                aria-label={`Ver historias de ${group.name}`}
              >
                <span
                  className={cn(
                    "rounded-full p-[2.5px]",
                    hasNew
                      ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-500"
                      : "bg-white/15",
                  )}
                >
                  <img
                    src={group.image}
                    alt={group.name}
                    className="size-14 rounded-full border-2 border-black object-cover"
                    loading="lazy"
                  />
                </span>
                <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                  {group.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {position && (
        <StoryViewer
          groups={groups}
          position={position}
          onPositionChange={setPosition}
          onClose={() => setPosition(null)}
          onSeen={markSeen}
        />
      )}
    </>
  );
}
