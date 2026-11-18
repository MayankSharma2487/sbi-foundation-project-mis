import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, ErrorBox, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

const schema = z.object({
  current_password: z.string().min(1, "Enter your current password"),
  new_password: z.string().min(10, "At least 10 characters"),
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
  .refine((v) => v.new_password !== v.current_password, { path: ["new_password"], message: "Must differ from the current password" });
type F = z.infer<typeof schema>;

export default function ProfilePage() {
  const { me, logout } = useAuth(), toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });
  if (!me) return null;
  return (
    <>
      <PageHeader title="Profile & Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">Account</h2>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt><dd>{me.full_name}</dd>
            <dt className="text-muted-foreground">Email</dt><dd>{me.email}</dd>
            <dt className="text-muted-foreground">Phone</dt><dd>{me.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">Last sign-in</dt><dd>{fmtDate(me.last_login_at)}</dd>
            <dt className="text-muted-foreground">Permissions</dt><dd>{me.permissions.length} granted</dd>
            <dt className="text-muted-foreground">Access</dt>
            <dd>{me.assignments.length ? me.assignments.map((a) => (
              <div key={a.id} className="capitalize">{a.role_code.replace(/_/g, " ")} — {a.village_id ? "village" : a.block_id ? "block" : a.district_id ? "district" : "project"}-level</div>)) : "None assigned"}</dd>
          </dl>
          <Button variant="outline" size="sm" onClick={logout}>Sign out</Button>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Change password</h2>
          <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
            setError(null);
            try { await api.changePassword(v.current_password, v.new_password); toast("Password changed — please sign in again"); logout(); }
            catch (e) { setError(e); }
          })}>
            <Field label="Current password" error={errors.current_password?.message}><Input type="password" autoComplete="current-password" {...register("current_password")} /></Field>
            <Field label="New password" error={errors.new_password?.message}><Input type="password" autoComplete="new-password" {...register("new_password")} /></Field>
            <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register("confirm")} /></Field>
            {error != null && <ErrorBox error={error} />}
            <Button type="submit" disabled={isSubmitting}>Update password</Button>
            <p className="text-xs text-muted-foreground">Changing your password signs you out on every device.</p>
          </form>
        </Card>
      </div>
    </>
  );
}
