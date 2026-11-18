import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, ErrorBox } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";

const schema = z.object({ email: z.string().min(1, "Email is required"), password: z.string().min(1, "Password is required") });
type F = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">M</div>
          <h1 className="text-lg font-semibold text-primary">SBI Foundation Project MIS</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => { setError(null); try { await login(v.email, v.password); } catch (e) { setError(e); } })}>
          <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" autoFocus {...register("email")} /></Field>
          <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register("password")} /></Field>
          {error != null && <ErrorBox error={error} />}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
        </form>
      </Card>
    </div>
  );
}
