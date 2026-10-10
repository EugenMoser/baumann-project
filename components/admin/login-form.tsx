"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoginState } from "@/app/admin/login/actions";
import { Field } from "./field";

type Props = {
  action: (prev: LoginState, formData: FormData) => Promise<LoginState>;
  next: string;
};

export function LoginForm({ action, next }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    email: "",
  });
  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      <Field id="email" label="E-Mail">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
        />
      </Field>
      <Field id="password" label="Passwort">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
