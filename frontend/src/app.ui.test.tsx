// @vitest-environment jsdom
// Renders the real <App/> in jsdom and drives it like a user against the LIVE backend.
// Usage: VITE_API_URL=http://localhost:8000/api/v1 npx vitest run
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";

const live = !!process.env.VITE_API_URL;
const PW = process.env.MIS_ADMIN_PASSWORD ?? "Initial-Admin-Pass-1";
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const run = Date.now().toString(36);

function mount(path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></MemoryRouter></QueryClientProvider>,
  );
}
async function signIn(email: string, pw: string) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText("Email"), email);
  await u.type(screen.getByLabelText("Password"), pw);
  await u.click(screen.getByRole("button", { name: "Sign in" }));
  return u;
}
afterEach(() => { cleanup(); sessionStorage.clear(); });
// Radix removes body pointer-events:none asynchronously after a dialog closes.
const dialogGone = () => waitFor(() => expect(document.body.style.pointerEvents).not.toBe("none"));

describe.skipIf(!live)("React UI against live backend", () => {
  it("shows an error for bad credentials and stays on login", async () => {
    mount(); await signIn("admin@example.org", "wrong-password-9");
    expect(await screen.findByText(/Incorrect email or password/)).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("login -> dashboard shows live KPI numbers and nav for the user's permissions", async () => {
    mount(); await signIn("admin@example.org", PW);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    const card = (await screen.findByText("Districts")).parentElement!;
    await waitFor(() => expect(Number(within(card).getByText(/^\d+$/).textContent)).toBeGreaterThanOrEqual(2));
    for (const n of ["Projects", "Locations", "Users", "Roles & Permissions", "Audit Logs"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
  });

  it("Locations: create a district through the form, see it listed, then archive it", async () => {
    mount(); const u = await signIn("admin@example.org", PW);
    await u.click((await screen.findAllByText("Locations"))[0]);
    await u.click(await screen.findByRole("button", { name: /Add district/ }));
    const dlg = await screen.findByRole("dialog");
    const stateSel = within(dlg).getAllByRole("combobox")[0] as HTMLSelectElement;
    await waitFor(() => expect(stateSel.options.length).toBeGreaterThan(1));
    await u.selectOptions(stateSel, stateSel.options[1].value);
    await u.type(within(dlg).getByLabelText("Name"), `UI District ${run}`);
    await u.click(within(dlg).getByRole("button", { name: "Create" }));
    await dialogGone();
    await u.type(await screen.findByLabelText("Search"), `UI District ${run}`);
    expect(await screen.findByText(`UI District ${run}`)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: `Archive UI District ${run}` }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByText(`UI District ${run}`)).toBeNull());
  });

  it("Roles: permission matrix loads and super admin is read-only", async () => {
    mount(); const u = await signIn("admin@example.org", PW);
    await u.click((await screen.findAllByText("Roles & Permissions"))[0]);
    await u.click(await screen.findByRole("button", { name: /^Super Admin/ }));
    await waitFor(async () => { const b = await screen.findByLabelText("projects:read") as HTMLInputElement; expect(b.checked).toBe(true); expect(b.disabled).toBe(true); });
    await u.click(screen.getByRole("button", { name: /^Trainer/ }));          // a normal role is editable
    await waitFor(async () => { const b = await screen.findByLabelText("trainings:create") as HTMLInputElement; expect(b.checked).toBe(true); expect(b.disabled).toBe(false); });
  });

  it("Audit Logs lists real entries", async () => {
    mount(); const u = await signIn("admin@example.org", PW);
    await u.click((await screen.findAllByText("Audit Logs"))[0]);
    expect((await screen.findAllByText("login")).length).toBeGreaterThan(0);
  });

  it("scoped Field Coordinator: sees only permitted nav and own district, no admin pages", async () => {
    mount(); const u = await signIn("fc.a@sample.local", PW);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.queryByText("Users")).toBeNull(); expect(screen.queryByText("Audit Logs")).toBeNull();
    await u.click((await screen.findAllByText("Locations"))[0]);
    expect(await screen.findByText("SAMPLE District A")).toBeTruthy();
    expect(screen.queryByText("SAMPLE District B")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add district/ })).toBeNull();   // no locations:create
  });

  it("Users: admin creates a user with district access via the form", async () => {
    mount(); const u = await signIn("admin@example.org", PW);
    await u.click((await screen.findAllByText("Users"))[0]);
    await u.click(await screen.findByRole("button", { name: /Add user/ }));
    const dlg = await screen.findByRole("dialog");
    await u.type(within(dlg).getByLabelText("Full name"), "UI Created");
    await u.type(within(dlg).getByLabelText("Email"), `ui-${run}@example.org`);
    await u.type(within(dlg).getByLabelText(/Initial password/), "Integration-Pass-1");
    await u.click(within(dlg).getByRole("button", { name: "Create user" }));
    await dialogGone();
    await u.type(await screen.findByLabelText("Search users"), `ui-${run}`);
    expect(await screen.findByText(`ui-${run}@example.org`)).toBeTruthy();
  });

  it("Projects: create with districts via the form, edit status, archive", async () => {
    mount(); const u = await signIn("admin@example.org", PW);
    await u.click((await screen.findAllByText("Projects"))[0]);
    await u.click(await screen.findByRole("button", { name: /New project/ }));
    const dlg = await screen.findByRole("dialog");
    await u.type(within(dlg).getByLabelText("Project code"), `UI-${run}`);
    await u.type(within(dlg).getByLabelText("Project name"), `UI Project ${run}`);
    const st = within(dlg).getByLabelText("State") as HTMLSelectElement;
    await waitFor(() => expect(st.options.length).toBeGreaterThan(1));
    await u.selectOptions(st, st.options[1].value);
    const first = (await within(dlg).findAllByRole("checkbox"))[0];
    await u.click(first);
    await u.click(within(dlg).getByRole("button", { name: "Create project" }));
    await dialogGone();
    const row = (await screen.findByText(`UI Project ${run}`)).closest("tr")!;
    expect(within(row).getByText("planned")).toBeTruthy();
    expect(within(row).getByText("1")).toBeTruthy();                      // 1 district covered
    await u.click(within(row).getByRole("button", { name: `Edit UI Project ${run}` }));
    const edit = await screen.findByRole("dialog");
    await u.selectOptions(within(edit).getByLabelText("Status"), "active");
    await u.click(within(edit).getByRole("button", { name: "Save changes" }));
    await dialogGone();
    await waitFor(() => expect(within(screen.getByText(`UI Project ${run}`).closest("tr")!).getByText("active")).toBeTruthy());
    await u.click(screen.getByRole("button", { name: `Archive UI Project ${run}` }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByText(`UI Project ${run}`)).toBeNull());
  });
});
