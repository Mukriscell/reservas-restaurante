import { redirect } from "next/navigation";
import { sesionAdminValida } from "@/lib/auth";
import PanelAdmin from "./panel";

// El panel es solo para el personal: sin sesión se vuelve al login.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await sesionAdminValida())) redirect("/admin/login");
  return <PanelAdmin />;
}
