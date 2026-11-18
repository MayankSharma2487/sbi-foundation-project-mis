import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");
