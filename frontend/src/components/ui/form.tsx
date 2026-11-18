import * as React from "react";
import { cn } from "@/lib/utils";

const field = "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(field, className)} {...p} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, "h-auto min-h-[70px] py-2", className)} {...p} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => <select ref={ref} className={cn(field, "pr-8", className)} {...p}>{children}</select>,
);
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-sm font-medium leading-none", className)} {...p} />
);

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const id = React.useId();
  // Associate the label with its control (composite children such as cascades label their own selects).
  const child = React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {child}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
