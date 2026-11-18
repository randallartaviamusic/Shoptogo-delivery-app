import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import {
  COURIER_VEHICLES,
  VERIFICATION_META,
  isValidCostaRicaId,
  isValidCostaRicaPhone,
} from "@/lib/trust";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  Bike,
  IdCard,
  Loader2,
  MessageSquareCode,
  Phone,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  muted: "border-border/80 bg-secondary/50 text-muted-foreground",
  ember: "border-accent/40 bg-accent/10 text-accent",
  green: "border-accent/40 bg-accent/10 text-accent",
  chili: "border-primary/40 bg-primary/10 text-primary",
};

/** Datos básicos que la administración revisa para dar confianza a la cuenta. */
export function VerificationCard() {
  const data = useQuery(api.verification.mine);
  const submit = useMutation(api.verification.submit);
  const sendCode = useAction(api.verification.sendPhoneCode);
  const checkCode = useAction(api.verification.checkPhoneCode);
  const checkId = useAction(api.verification.checkId);
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoBusy, setAutoBusy] = useState<"phone" | "code" | "identity" | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setPhone(data.phone ?? "");
    setIdNumber(data.idNumber ?? "");
    setVehicle(data.vehicle ?? "");
  }, [data]);

  if (!data) return null;

  const meta = VERIFICATION_META[data.status];
  const isCourier = data.role === "courier";
  const isVerified = data.status === "verified";
  const phoneVerified = Boolean(data.phoneVerifiedAt);
  const idVerified = Boolean(data.idVerifiedAt);

  const handleSendCode = async () => {
    if (!isValidCostaRicaPhone(phone)) {
      toast.error("Escribí un teléfono de Costa Rica de 8 dígitos");
      return;
    }
    setAutoBusy("phone");
    try {
      await sendCode({ phone });
      setCodeSent(true);
      toast.success("Código enviado", {
        description: "Revisá el SMS en tu teléfono.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos enviar el código");
    } finally {
      setAutoBusy(null);
    }
  };

  const handleCheckCode = async () => {
    setAutoBusy("code");
    try {
      await checkCode({ code });
      setCode("");
      setCodeSent(false);
      toast.success("Teléfono verificado", {
        description: "Ya confirmamos que podés recibir mensajes en ese número.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos confirmar el código");
    } finally {
      setAutoBusy(null);
    }
  };

  const handleCheckId = async () => {
    if (!isValidCostaRicaId(idNumber)) {
      toast.error("Escribí la cédula con 9 dígitos");
      return;
    }
    setAutoBusy("identity");
    try {
      const result = await checkId({ idNumber });
      if (result.matched) {
        toast.success("Cédula confirmada", {
          description: "Coincide con el registro civil.",
        });
      } else if ("pendingReview" in result) {
        toast("El registro no respondió", {
          description: "No te rechazamos por un problema técnico; la cuenta seguirá en revisión.",
        });
      } else {
        toast.error("La cédula no coincide", {
          description: result.reason ?? "Revisá el número e intentá de nuevo.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos consultar la cédula");
    } finally {
      setAutoBusy(null);
    }
  };

  const handleSubmit = async () => {
    if (!accepted) {
      toast.error("Confirmá que los datos son tuyos para enviarlos a revisión");
      return;
    }
    if (!isValidCostaRicaPhone(phone)) {
      toast.error("Escribí un teléfono de Costa Rica de 8 dígitos");
      return;
    }
    if (!isValidCostaRicaId(idNumber)) {
      toast.error("Escribí la cédula con 9 dígitos");
      return;
    }
    if (isCourier && vehicle.trim().length < 3) {
      toast.error("Contanos en qué vehículo repartís");
      return;
    }
    setSaving(true);
    try {
      await submit({
        phone,
        idNumber,
        vehicle: isCourier ? vehicle : undefined,
        accepted: true,
      });
      setAccepted(false);
      toast.success("Datos guardados", {
        description:
          "Confirmá el teléfono por SMS y consultá la cédula para evitar la revisión manual cuando los proveedores estén configurados.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos enviar tus datos",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="verificacion"
      className="surface-raised mt-5 scroll-mt-24 rounded-3xl p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <ShieldCheck className="size-3.5" /> Confianza y seguridad
          </p>
          <h2 className="font-display text-lg font-bold">Verificación de cuenta</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Confirmá el teléfono por SMS y la cédula contra el registro civil. Si
            ambos controles coinciden, tu cuenta se activa sin esperar revisión.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
            TONE[meta.tone],
          )}
        >
          {meta.label}
        </span>
      </div>

      <p className="mt-3 rounded-xl border border-border/70 bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        {meta.hint}
        {isCourier
          ? " Sin verificación no podés tomar entregas."
          : " Mientras no esté verificada, tu local no aparece en el catálogo ni recibe pedidos nuevos."}
        {isVerified &&
          " Si cambiás el teléfono, la cuenta vuelve a revisión para proteger los contactos de entrega."}
      </p>
      {data.note && (
        <p className="mt-2 rounded-xl border border-primary/25 bg-primary/[0.06] p-3 text-[11px] leading-relaxed text-primary">
          <span className="font-semibold">Nota del administrador:</span> {data.note}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="verification-phone" className="flex items-center gap-1.5">
            <Phone className="size-3.5 text-accent" /> Teléfono
          </Label>
          <Input
            id="verification-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+506 8888 8888"
            inputMode="tel"
          />
          <p className="text-[10px] text-muted-foreground">
            {phoneVerified ? "Teléfono confirmado por SMS." : "Verificalo con un código SMS para usarlo como contacto."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-accent/35 text-[11px]"
              disabled={autoBusy !== null || phoneVerified}
              onClick={() => void handleSendCode()}
            >
              {autoBusy === "phone" ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
              {phoneVerified ? "Teléfono confirmado" : codeSent ? "Reenviar código" : "Enviar código SMS"}
            </Button>
            {codeSent && (
              <div className="flex min-w-0 flex-1 gap-1.5">
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="Código SMS"
                  aria-label="Código de verificación por SMS"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-accent text-accent-foreground"
                  disabled={autoBusy !== null || code.trim().length < 4}
                  onClick={() => void handleCheckCode()}
                >
                  {autoBusy === "code" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquareCode className="size-3.5" />}
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="verification-id" className="flex items-center gap-1.5">
            <IdCard className="size-3.5 text-accent" /> Cédula
          </Label>
          <Input
            id="verification-id"
            value={idNumber}
            onChange={(event) => setIdNumber(event.target.value)}
            placeholder="1-2345-6789"
            inputMode="numeric"
          />
          <p className="text-[10px] text-muted-foreground">
            {idVerified
              ? `Confirmada contra el registro civil${data.idVerifiedName ? ` como ${data.idVerifiedName}` : ""}.`
              : "Se consulta en el registro civil y no se muestra en el catálogo."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-accent/35 text-[11px]"
            disabled={autoBusy !== null || idVerified}
            onClick={() => void handleCheckId()}
          >
            {autoBusy === "identity" ? <Loader2 className="size-3.5 animate-spin" /> : <IdCard className="size-3.5" />}
            {idVerified ? "Cédula confirmada" : "Consultar cédula"}
          </Button>
        </div>

        {isCourier ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="verification-vehicle" className="flex items-center gap-1.5">
              <Bike className="size-3.5 text-accent" /> Vehículo con el que repartís
            </Label>
            <div className="flex flex-wrap gap-2">
              {COURIER_VEHICLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setVehicle(option)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                    vehicle === option
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            {!COURIER_VEHICLES.includes(
              vehicle as (typeof COURIER_VEHICLES)[number],
            ) && (
              <Input
                value={vehicle}
                onChange={(event) => setVehicle(event.target.value)}
                placeholder="Otro vehículo"
              />
            )}
          </div>
        ) : (
          <div className="sm:col-span-2 rounded-xl border border-border/70 bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">
              {data.businessName ?? "Tu local"}
            </p>
            <p>{data.businessAddress ?? "Cargá la dirección del local en el onboarding."}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-black/20 p-3">
        <div>
          <p className="text-xs font-semibold">Declaración de datos</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Confirmo que estos datos son míos, que la cédula y el teléfono son
            reales y que puedo recibir llamadas de la plataforma o del comprador.
          </p>
        </div>
        <Switch checked={accepted} onCheckedChange={setAccepted} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          className="gap-2 bg-ember-gradient text-black"
          disabled={saving}
          onClick={() => void handleSubmit()}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isVerified ? (
            <BadgeCheck className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {isVerified ? "Actualizar datos" : "Guardar mis datos"}
        </Button>
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldAlert className="size-3.5" />
          {isVerified
            ? data.verifiedAutomatically
              ? "Confirmada por SMS y registro civil."
              : "La cuenta conserva una verificación manual previa."
            : data.automation.phone && data.automation.identity
              ? "SMS + registro civil: aprobación automática si ambos coinciden."
              : "Sin claves externas, podés solicitar revisión manual."}
        </p>
      </div>
    </section>
  );
}
