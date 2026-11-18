// Runs the REAL typed API client (the same one the React screens use) against a live backend.
// Usage: VITE_API_URL=http://localhost:8000/api/v1 MIS_ADMIN_PASSWORD=... npx vitest run
import { beforeAll, describe, expect, it } from "vitest";
import { api, ApiError, tokens } from "./api";

const live = !!process.env.VITE_API_URL;
const PW = process.env.MIS_ADMIN_PASSWORD ?? "Initial-Admin-Pass-1";
const run = Date.now().toString(36);

const asAdmin = () => api.login("admin@example.org", PW);
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as ApiError; } throw new Error("expected failure"); };

describe.skipIf(!live)("frontend API client against live backend", () => {
  beforeAll(async () => { await asAdmin(); });

  it("login + me returns permissions; wrong password gives a readable error", async () => {
    const me = await api.me();
    expect(me.email).toBe("admin@example.org");
    expect(me.permissions).toContain("users:manage_users");
    const e = await err(api.login("admin@example.org", "wrong-password-1"));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(401);
    await asAdmin();
  });

  it("transparently refreshes an expired/invalid access token", async () => {
    const good = tokens.refresh!;
    tokens.set("garbage.access.token", good);
    const me = await api.me();               // 401 -> refresh -> retry
    expect(me.email).toBe("admin@example.org");
  });

  it("geography CRUD, uniqueness error and archive guard", async () => {
    const st = (await api.geo.list("states")).items[0];
    const d = await api.geo.create("districts", { name: `IT District ${run}`, code: "ITD", parent_id: st.id });
    expect((await err(api.geo.create("districts", { name: `IT District ${run}`, parent_id: st.id }))).status).toBe(409);
    const b = await api.geo.create("blocks", { name: `IT Block ${run}`, parent_id: d.id });
    const v = await api.geo.create("villages", { name: `IT Village ${run}`, parent_id: b.id });
    expect((await api.geo.update("villages", v.id, { name: `IT Village ${run} X` })).name).toContain("X");
    expect((await err(api.geo.archive("districts", d.id))).status).toBe(409);
    expect((await api.geo.list("villages", { parent_id: b.id })).total).toBe(1);
    await api.geo.archive("villages", v.id); await api.geo.archive("blocks", b.id); await api.geo.archive("districts", d.id);
    expect((await api.geo.list("districts", { q: `IT District ${run}` })).total).toBe(0);
  });

  it("project CRUD with district coverage and validation", async () => {
    const st = (await api.geo.list("states")).items[0];
    const dists = (await api.geo.list("districts", { parent_id: st.id })).items;
    const p = await api.projects.create({ code: `IT-${run}`, name: "IT project", state_id: st.id, district_ids: [dists[0].id] });
    expect(p.district_ids).toHaveLength(1);
    expect((await api.projects.addLocation(p.id, dists[1].id)).district_ids).toHaveLength(2);
    expect((await api.projects.removeLocation(p.id, dists[0].id)).district_ids).toEqual([dists[1].id]);
    expect((await api.projects.update(p.id, { status: "active" })).status).toBe("active");
    expect((await err(api.projects.update(p.id, { status: "nonsense" }))).status).toBe(422);
    expect((await err(api.projects.create({ code: `IT-${run}`, name: "dup", state_id: st.id }))).status).toBe(409);
    await api.projects.archive(p.id);
    expect((await api.projects.list({ limit: 200 })).items.find((x) => x.id === p.id)).toBeUndefined();
  });

  it("user lifecycle: create, assign, update, deactivate", async () => {
    const dists = (await api.geo.list("districts")).items;
    const email = `it-${run}@example.org`;
    const u = await api.users.create({ email, full_name: "IT User", password: "Integration-Pass-1", assignments: [] });
    expect((await err(api.users.create({ email, full_name: "dup", password: "Integration-Pass-1", assignments: [] }))).status).toBe(409);
    const u2 = await api.users.addAssignment(u.id, { role_code: "field_coordinator", district_id: dists[0].id });
    expect(u2.assignments).toHaveLength(1);
    expect((await api.users.get(u.id)).assignments[0].district_id).toBe(dists[0].id);
    expect((await api.users.update(u.id, { full_name: "IT User 2" })).full_name).toBe("IT User 2");
    expect((await api.users.list({ q: `it-${run}` })).total).toBe(1);
    expect((await api.users.removeAssignment(u.id, u2.assignments[0].id)).assignments).toHaveLength(0);
    expect((await api.users.update(u.id, { is_active: false })).is_active).toBe(false);
    expect((await err(api.login(email, "Integration-Pass-1"))).status).toBe(401);
  });

  it("geographic restriction is enforced for a scoped user", async () => {
    const all = (await api.geo.list("districts")).items;
    const email = `fc-${run}@example.org`;
    const u = await api.users.create({ email, full_name: "FC", password: "Integration-Pass-1",
      assignments: [{ role_code: "field_coordinator", project_id: null, district_id: all[0].id, block_id: null, village_id: null }] });
    await api.login(email, "Integration-Pass-1");
    expect((await api.geo.list("districts")).items.map((d) => d.id)).toEqual([all[0].id]);
    expect((await api.summary({})).totals.districts).toBe(1);
    expect((await err(api.summary({ district_id: all[1].id }))).status).toBe(404);
    expect((await err(api.users.list())).status).toBe(403);
    expect((await err(api.audit({}))).status).toBe(403);
    await asAdmin();
    await api.users.update(u.id, { is_active: false });
  });

  it("roles: permission edit round-trips and super admin is protected", async () => {
    const roles = await api.roles.list();
    const trainer = roles.find((r) => r.code === "trainer")!;
    const before = (await api.roles.rolePerms(trainer.id)).codes;
    const changed = await api.roles.setRolePerms(trainer.id, [...before, "reports:read"]);
    expect(changed.codes).toContain("reports:read");
    await api.roles.setRolePerms(trainer.id, before);
    expect((await api.roles.rolePerms(trainer.id)).codes).toEqual([...before].sort());
    expect((await err(api.roles.setRolePerms(roles.find((r) => r.code === "super_admin")!.id, []))).status).toBe(409);
    expect((await api.roles.permissions()).length).toBe(170);
  });

  it("dashboard summary reflects live data and audit log records the changes", async () => {
    const before = (await api.summary({})).totals.districts;
    const st = (await api.geo.list("states")).items[0];
    const d = await api.geo.create("districts", { name: `Dash ${run}`, parent_id: st.id });
    expect((await api.summary({})).totals.districts).toBe(before + 1);
    expect((await api.summary({ district_id: d.id })).totals).toEqual({ districts: 1, blocks: 0, villages: 0, projects: 0 });
    const log = await api.audit({ entity: "districts", action: "create", limit: 5 });
    expect(log.items.some((a) => (a.detail as { name?: string })?.name === `Dash ${run}`)).toBe(true);
    await api.geo.archive("districts", d.id);
  });

  it("change password signs out old tokens and the new password works", async () => {
    const email = `pw-${run}@example.org`;
    await api.users.create({ email, full_name: "PW", password: "Integration-Pass-1", assignments: [{ role_code: "field_coordinator", project_id: null, district_id: null, block_id: null, village_id: null }] });
    await api.login(email, "Integration-Pass-1");
    await api.changePassword("Integration-Pass-1", "Another-New-Pass-2");
    expect((await err(api.me())).status).toBe(401);   // old token dead (refresh also dead)
    await api.login(email, "Another-New-Pass-2");
    expect((await api.me()).email).toBe(email);
    await asAdmin();
  });
});
