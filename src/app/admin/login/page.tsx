import { redirect } from "next/navigation";
import { sesionAdminValida } from "@/lib/auth";
import FormularioLogin from "./form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MESALISTA — Acceso administrador",
};

export default async function LoginPage() {
  if (await sesionAdminValida()) redirect("/admin");
  return <FormularioLogin />;
}
