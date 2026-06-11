"use client";

import { useMemo, useState } from "react";
import {
  Accessibility,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Users,
  Wallet,
} from "lucide-react";
import {
  MENUS,
  PERSONAS_ABONO_OBLIGATORIO,
  PRECIO_NINO_3_5,
  PRECIO_NINO_6_11,
  calcularTotal,
  formatCLP,
  type MenuId,
} from "@/lib/menu";
import { SALONES, type Salon } from "@/lib/salones";
import {
  DIAS_ATENCION,
  horasDeIngreso,
  serviciosParaFecha,
} from "@/lib/horarios";

const HORARIOS_TEXTO = DIAS_ATENCION.map(
  (d) =>
    `${d.nombre} ${d.servicios
      .map((s) => `${s.nombre.toLowerCase()} ${s.desde}–${s.hasta}`)
      .join(" y ")}`
).join(" · ");

interface FormState {
  nombreEncargado: string;
  telefono: string;
  fecha: string;
  hora: string;
  adultos: number;
  ninos6a11: number;
  ninos3a5: number;
  menuId: MenuId;
  salon: Salon | "";
  accesibilidad: boolean;
  detalles: string;
  abono: number;
}

const initialState: FormState = {
  nombreEncargado: "",
  telefono: "",
  fecha: "",
  hora: "",
  adultos: 2,
  ninos6a11: 0,
  ninos3a5: 0,
  menuId: "BUFFET",
  salon: "",
  accesibilidad: false,
  detalles: "",
  abono: 0,
};

export default function ReservaPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () =>
      calcularTotal({
        menuId: form.menuId,
        adultos: form.adultos,
        ninos6a11: form.ninos6a11,
        ninos3a5: form.ninos3a5,
      }),
    [form.menuId, form.adultos, form.ninos6a11, form.ninos3a5]
  );

  const totalPersonas = form.adultos + form.ninos6a11 + form.ninos3a5;
  const abonoObligatorio = totalPersonas >= PERSONAS_ABONO_OBLIGATORIO;
  const saldoPendiente = Math.max(total - form.abono, 0);
  const serviciosDia = form.fecha ? serviciosParaFecha(form.fecha) : [];
  const fechaSinAtencion = form.fecha !== "" && serviciosDia.length === 0;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          salon: form.salon || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const detalle = json.detalles?.[0]?.mensaje;
        throw new Error(detalle ?? json.error ?? "No se pudo crear la reserva");
      }
      setExito(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-green-200 bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
        <h1 className="mt-4 text-2xl font-bold">¡Reserva recibida!</h1>
        <p className="mt-2 text-stone-600">
          Hemos registrado la mesa a nombre de{" "}
          <strong>{form.nombreEncargado}</strong> para {totalPersonas}{" "}
          {totalPersonas === 1 ? "persona" : "personas"} el {form.fecha} a las{" "}
          {form.hora}. Total estimado: <strong>{formatCLP(total)}</strong>.
          {form.abono > 0 && (
            <>
              {" "}
              Abono registrado: <strong>{formatCLP(form.abono)}</strong> ·
              saldo a pagar en el restaurante:{" "}
              <strong>{formatCLP(saldoPendiente)}</strong>.
            </>
          )}
        </p>
        <button
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          onClick={() => {
            setForm(initialState);
            setExito(false);
          }}
        >
          Hacer otra reserva
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-brand-900">
          Reserva tu mesa
        </h1>
        <p className="mt-1 text-stone-600">
          Completa el formulario y tu mesa quedará registrada al instante.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {/* Datos del encargado */}
          <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-brand-800">
              <CalendarDays className="h-4 w-4" /> Datos de la reserva
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="nombre">
                  Nombre de la persona encargada de la mesa *
                </label>
                <input
                  id="nombre"
                  className="input"
                  required
                  minLength={2}
                  placeholder="Ej: María González"
                  value={form.nombreEncargado}
                  onChange={(e) => set("nombreEncargado", e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="telefono">
                  Teléfono de contacto (opcional)
                </label>
                <input
                  id="telefono"
                  className="input"
                  placeholder="+56 9 1234 5678"
                  value={form.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="fecha">
                    Fecha *
                  </label>
                  <input
                    id="fecha"
                    type="date"
                    className="input"
                    required
                    value={form.fecha}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        fecha: e.target.value,
                        hora: "",
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor="hora">
                    Hora de ingreso *
                  </label>
                  <select
                    id="hora"
                    className="input"
                    required
                    disabled={!form.fecha || fechaSinAtencion}
                    value={form.hora}
                    onChange={(e) => set("hora", e.target.value)}
                  >
                    <option value="">
                      {!form.fecha
                        ? "Elige primero la fecha"
                        : fechaSinAtencion
                          ? "Día sin atención"
                          : "Elige una hora"}
                    </option>
                    {serviciosDia.map((s) => (
                      <optgroup
                        key={s.id}
                        label={`${s.nombre} (${s.desde} a ${s.hasta})`}
                      >
                        {horasDeIngreso(s).map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {fechaSinAtencion && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Ese día no recibimos reservas: atendemos viernes, sábado y
                domingo.
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-xs text-stone-500">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Horarios de ingreso: {HORARIOS_TEXTO}.</span>
            </p>
          </fieldset>

          {/* Personas */}
          <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-brand-800">
              <Users className="h-4 w-4" /> Cantidad de personas
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="adultos">
                  Adultos (desde 12 años)
                </label>
                <input
                  id="adultos"
                  type="number"
                  min={0}
                  max={200}
                  className="input"
                  value={form.adultos}
                  onChange={(e) => set("adultos", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="ninos6a11">
                  Niños 6–11 años ({formatCLP(PRECIO_NINO_6_11)} c/u)
                </label>
                <input
                  id="ninos6a11"
                  type="number"
                  min={0}
                  max={200}
                  className="input"
                  value={form.ninos6a11}
                  onChange={(e) => set("ninos6a11", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="ninos3a5">
                  Niños 3–5 años ({formatCLP(PRECIO_NINO_3_5)} c/u)
                </label>
                <input
                  id="ninos3a5"
                  type="number"
                  min={0}
                  max={200}
                  className="input"
                  value={form.ninos3a5}
                  onChange={(e) => set("ninos3a5", Number(e.target.value))}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-stone-500">
              Menores de 3 años no pagan.
            </p>
          </fieldset>

          {/* Menú */}
          <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-brand-800">
              Opción de menú (precio por adulto)
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {MENUS.map((menu) => (
                <label
                  key={menu.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    form.menuId === menu.id
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                      : "border-stone-200 hover:border-brand-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="menu"
                    className="mt-1 accent-brand-600"
                    checked={form.menuId === menu.id}
                    onChange={() => set("menuId", menu.id)}
                  />
                  <span>
                    <span className="block font-semibold">{menu.nombre}</span>
                    <span className="block text-sm text-stone-500">
                      {menu.descripcion}
                    </span>
                    <span className="mt-1 block font-bold text-brand-700">
                      {formatCLP(menu.precioAdulto)} por persona
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Abono */}
          <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-brand-800">
              <Wallet className="h-4 w-4" /> Abono{" "}
              {abonoObligatorio ? "(obligatorio para tu mesa)" : "(opcional)"}
            </legend>
            <p className="text-sm text-stone-600">
              Las mesas de {PERSONAS_ABONO_OBLIGATORIO} o más personas deben
              dejar un abono al reservar. El monto abonado se descuenta
              después del total de la cuenta.
            </p>
            {abonoObligatorio && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Tu mesa es de {totalPersonas} personas: debes indicar un abono
                para confirmar la reserva.
              </p>
            )}
            <div className="mt-4 sm:max-w-xs">
              <label className="label" htmlFor="abono">
                Monto a abonar (CLP){abonoObligatorio && " *"}
              </label>
              <input
                id="abono"
                type="number"
                min={abonoObligatorio ? 1 : 0}
                max={total}
                required={abonoObligatorio}
                className="input"
                value={form.abono}
                onChange={(e) => set("abono", Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-stone-500">
                Máximo {formatCLP(total)} (total estimado de tu cuenta).
              </p>
            </div>
          </fieldset>

          {/* Salón y extras */}
          <fieldset className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-brand-800">
              Preferencias
            </legend>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="salon">
                  Salón para la mesa (opcional)
                </label>
                <select
                  id="salon"
                  className="input"
                  value={form.salon}
                  onChange={(e) => set("salon", e.target.value as Salon | "")}
                >
                  <option value="">Sin preferencia</option>
                  {SALONES.map((salon) => (
                    <option key={salon} value={salon}>
                      {salon}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-stone-200 p-4">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand-600"
                  checked={form.accesibilidad}
                  onChange={(e) => set("accesibilidad", e.target.checked)}
                />
                <span className="flex items-center gap-2 text-sm">
                  <Accessibility className="h-5 w-5 text-brand-600" />
                  Asistirá una persona con discapacidad (prepararemos un
                  espacio accesible)
                </span>
              </label>

              <div>
                <label className="label" htmlFor="detalles">
                  Detalles adicionales (opcional)
                </label>
                <textarea
                  id="detalles"
                  className="input min-h-[110px]"
                  maxLength={1000}
                  placeholder="Cumpleaños, alergias alimentarias, silla para bebé, decoración especial…"
                  value={form.detalles}
                  onChange={(e) => set("detalles", e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || totalPersonas === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 className="h-5 w-5 animate-spin" />}
            {enviando ? "Enviando reserva…" : "Confirmar reserva"}
          </button>
        </form>
      </section>

      {/* Resumen lateral */}
      <aside className="h-fit rounded-2xl border border-brand-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <h2 className="text-lg font-bold text-brand-900">Resumen</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Adultos × {form.adultos}</dt>
            <dd className="font-medium">
              {formatCLP(
                form.adultos *
                  MENUS.find((m) => m.id === form.menuId)!.precioAdulto
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">Niños 6–11 × {form.ninos6a11}</dt>
            <dd className="font-medium">
              {formatCLP(form.ninos6a11 * PRECIO_NINO_6_11)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">Niños 3–5 × {form.ninos3a5}</dt>
            <dd className="font-medium">
              {formatCLP(form.ninos3a5 * PRECIO_NINO_3_5)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-3 text-base">
            <dt className="font-bold">Total estimado</dt>
            <dd className="font-bold text-brand-700">{formatCLP(total)}</dd>
          </div>
          {form.abono > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-stone-600">Abono al reservar</dt>
                <dd className="font-medium text-green-700">
                  −{formatCLP(form.abono)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold">Saldo en el restaurante</dt>
                <dd className="font-semibold">{formatCLP(saldoPendiente)}</dd>
              </div>
            </>
          )}
        </dl>
        <p className="mt-4 text-xs text-stone-500">
          {totalPersonas} {totalPersonas === 1 ? "persona" : "personas"} ·{" "}
          {form.salon || "Sin preferencia de salón"}
          {abonoObligatorio && " · abono obligatorio (mesa de 10+)"}
        </p>
      </aside>
    </div>
  );
}
