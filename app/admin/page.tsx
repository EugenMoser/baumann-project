import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/admin/auth";

export default function AdminIndex() {
  redirect(ADMIN_HOME);
}
