// Editor panel (Phase 5b): edit tools on the globe and the flat map, undo and redo, system switches, the stale-stage list,
// re-run (now, or from a chosen stage) and cancel. Original shell code. The World lives in the engine worker; this module
// sends edit records and asks for runs, it never writes layers (design note 16 §3.1).
import type { EngineClient, EditState, StaleStage, SystemInfo } from '@mapmaker/engine';
import type { EditDraft, SystemMode } from '@mapmaker/core';
import type { Globe } from '../globe/globe';
import type { MapUi } from '../flat/map-ui';
import { DEFAULT_BRUSH, TOOLS, type Tool, addStrokePoint, brushRadiusRad, buildDraft, ringPoints, toolById } from './editing';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface EditorHost {
  client: EngineClient;
  ui: MapUi;
  globe: Globe | null;
  globeCanvas: HTMLCanvasElement;
  variant(): string;
  /** Runs the pipeline (optionally from a stage) and repaints. Rejects if a run is already in progress. */
  rerun(from?: string): Promise<void>;
  busy(): boolean;
  status(text: string): void;
}

export interface EditorHandle {
  /** A new world exists (or was re-run): reload the log, the switches and the stale list. */
  refresh(): Promise<void>;
  /** `sent`: every edit record this panel has sent to the engine, in order (test hook). */
  state(): { tool: string; edits: number; cursor: number; stale: StaleStage[]; sent: EditDraft[]; ring: { globe: number; flat: string } };
}

export function startEditor(host: EditorHost): EditorHandle {
  const { client, ui, globe } = host;
  const toolSel = $<HTMLSelectElement>('tool');
  const params = $('toolParams');
  const autoRun = $<HTMLInputElement>('autoRun');
  const brush = { ...DEFAULT_BRUSH };
  const sent: EditDraft[] = [];
  let ready = false, gesture = 1, log: EditState | undefined, stale: StaleStage[] = [], systems: SystemInfo[] = [];
  const values: Record<string, number> = {};

  const tool = (): Tool | null => (toolSel.value === 'none' ? null : toolById(toolSel.value));
  const usable = (t: Tool) => !(t.structuredOnly && host.variant() !== 'structured');

  function fillTools(): void {
    const keep = toolSel.value;
    toolSel.length = 0;
    toolSel.add(new Option('none (rotate and pan)', 'none'));
    for (const t of TOOLS) if (usable(t)) toolSel.add(Object.assign(new Option(t.label, t.id), { title: t.hint }));
    toolSel.value = [...toolSel.options].some((o) => o.value === keep) ? keep : 'none';
  }

  function buildParams(): void {
    params.replaceChildren();
    const t = tool();
    $('toolHint').textContent = t ? t.hint : 'Pick a tool, then drag on the globe or the flat map. One stroke is one edit; Undo removes it.';
    for (const k of Object.keys(values)) delete values[k];
    if (!t) return;
    for (const prm of t.params) {
      values[prm.key] = prm.value;
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'range'; input.id = `toolp-${prm.key}`;
      input.min = String(prm.min); input.max = String(prm.max); input.step = String(prm.step); input.value = String(prm.value);
      const out = document.createElement('span');
      out.className = 'val';
      const show = () => { out.textContent = `${input.value} ${prm.unit}`.trim(); };
      show();
      input.addEventListener('input', () => { values[prm.key] = Number(input.value); show(); });
      label.append(`${prm.label} `, input, ' ', out);
      params.append(label);
    }
  }

  function applyToolState(): void {
    const t = tool();
    const on = !!t;
    ui.setEditing(on);
    globe?.setControlsEnabled(!on);
    if (on) globe?.warmRing(); // the ring's shader is compiled now, not at the first hover
    $('brushSoftRow').hidden = brush.mode !== 'soft' || !!t?.seed;
    $<HTMLSelectElement>('brushMode').disabled = !!t?.seed;
    host.globeCanvas.style.cursor = on ? 'crosshair' : '';
    ui.element.style.cursor = on ? 'crosshair' : '';
  }

  function render(): void {
    const l = log;
    $('editCount').textContent = l ? `${l.cursor} of ${l.length} edits applied` : 'no world yet';
    $<HTMLButtonElement>('undo').disabled = !l?.canUndo || host.busy();
    $<HTMLButtonElement>('redo').disabled = !l?.canRedo || host.busy();
    $<HTMLButtonElement>('clearEdits').disabled = !l?.length || host.busy();
    $<HTMLButtonElement>('rerun').disabled = !stale.length || host.busy();
    $<HTMLButtonElement>('rerunFrom').disabled = !ready || host.busy();
    $('staleList').textContent = !ready ? '' : stale.length ? `needs re-running: ${stale.map((s) => `${s.stageId} (${s.reason})`).join(', ')}` : 'up to date';
    const ol = $('editList');
    ol.replaceChildren();
    for (const e of l?.edits ?? []) {
      const li = document.createElement('li');
      li.textContent = `${e.label ?? e.op} · ${e.target} · ${e.mode}`;
      li.className = e.active ? '' : 'undone';
      ol.append(li);
    }
  }

  async function reload(): Promise<void> {
    if (!ready) { render(); return; }
    [log, stale, systems] = await Promise.all([client.editAction('state'), client.stale(host.variant()), client.systems()]);
    const from = $<HTMLSelectElement>('fromStage');
    if (from.options.length !== systems.length) { from.length = 0; for (const s of systems) from.add(new Option(s.stageId, s.stageId)); }
    const box = $('systemsList');
    box.replaceChildren();
    for (const s of systems.filter((x) => x.switchable)) {
      const label = document.createElement('label');
      const sel = document.createElement('select');
      sel.id = `sys-${s.stageId}`;
      for (const m of ['simulate', 'manual', 'off'] as SystemMode[]) sel.add(new Option(m, m));
      sel.value = s.mode;
      sel.addEventListener('change', () => { void setSystems().catch(fail); });
      label.append(`${s.stageId} `, sel);
      box.append(label, ' ');
    }
    render();
  }

  const fail = (e: unknown) => { host.status(`error: ${e instanceof Error ? e.message : String(e)}`); };

  async function afterEdit(): Promise<void> {
    await reload();
    if (autoRun.checked && stale.length && !host.busy()) await host.rerun();
    await reload();
  }

  async function setSystems(): Promise<void> {
    const set: Record<string, SystemMode> = {};
    for (const s of systems.filter((x) => x.switchable)) set[s.stageId] = $<HTMLSelectElement>(`sys-${s.stageId}`).value as SystemMode;
    await client.systems(set);
    await afterEdit();
  }

  // Strokes: pointer down starts one, moves add points (spaced a quarter radius apart), pointer up commits one edit.
  let stroke: { path: number[]; pick: (e: PointerEvent) => [number, number, number] | null; el: HTMLElement } | null = null;
  const radiusRad = () => brushRadiusRad(brush.radiusDeg);
  // Brush ring under the pointer (Phase 5c): the edge of the region one stroke point edits; cheap, redrawn per frame.
  let hover: { el: HTMLElement; pick: (e: PointerEvent) => [number, number, number] | null; v: [number, number, number] } | null = null;
  let ringPending = false;
  function drawRing(): void {
    if (ringPending) return; // the frame reads the pointer state when it runs, so one pending frame covers every request
    ringPending = true;
    requestAnimationFrame(() => {
      ringPending = false;
      const on = !!tool() && ready && hover;
      const pts = on && hover ? ringPoints(hover.v, radiusRad()) : null;
      if (globe) globe.setRing(pts && hover?.el === host.globeCanvas ? pts : null);
      ui.setRing(pts && hover?.el === ui.element ? pts : null);
    });
  }
  function attach(el: HTMLElement, pick: (e: PointerEvent) => [number, number, number] | null): void {
    el.addEventListener('pointermove', (e) => { const v = pick(e); hover = v ? { el, pick, v } : null; drawRing(); });
    el.addEventListener('pointerleave', () => { hover = null; drawRing(); });
    el.addEventListener('pointerdown', (e) => {
      const t = tool();
      if (!t || !ready || host.busy() || e.button !== 0) return;
      const v = pick(e);
      if (!v) return;
      stroke = { path: [], pick, el };
      addStrokePoint(stroke.path, v, 0);
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!stroke || stroke.el !== el || tool()?.brush === 'point') return;
      const v = stroke.pick(e);
      if (v) addStrokePoint(stroke.path, v, radiusRad() / 4);
      host.status(`stroke: ${stroke.path.length / 3} points`);
    });
    el.addEventListener('pointerup', (e) => {
      if (!stroke || stroke.el !== el) return;
      const s = stroke; stroke = null;
      const v = s.pick(e);
      if (v && tool()?.brush !== 'point') addStrokePoint(s.path, v, radiusRad() / 4);
      const t = tool();
      if (!t || !s.path.length) return;
      void (async () => {
        const draft = buildDraft(t, brush, values, s.path, gesture++);
        sent.push(draft);
        log = await client.appendEdits([draft]);
        host.status(`${t.label}: ${s.path.length / 3} point${s.path.length > 3 ? 's' : ''}`);
        await afterEdit();
      })().catch(fail);
    });
  }
  if (globe) attach(host.globeCanvas, (e) => globe.pick(e.clientX, e.clientY));
  attach(ui.element, (e) => ui.pick(e.clientX, e.clientY));

  // Controls.
  fillTools(); buildParams(); applyToolState();
  toolSel.addEventListener('change', () => { buildParams(); applyToolState(); drawRing(); });
  const num = (id: string, f: (v: number) => void) => { const i = $<HTMLInputElement>(id); const upd = () => { f(Number(i.value)); $(`${id}Val`).textContent = i.value; }; i.addEventListener('input', upd); upd(); };
  num('brushRadius', (v) => { brush.radiusDeg = v; drawRing(); });
  num('brushFalloff', (v) => { brush.falloff = v; });
  num('brushWeight', (v) => { brush.weight = v; });
  $<HTMLSelectElement>('brushMode').addEventListener('change', (e) => { brush.mode = (e.target as HTMLSelectElement).value === 'soft' ? 'soft' : 'pin'; applyToolState(); });
  const act = (f: () => Promise<unknown>) => () => { void f().then(afterEdit).catch(fail); };
  $('undo').addEventListener('click', act(() => client.editAction('undo')));
  $('redo').addEventListener('click', act(() => client.editAction('redo')));
  $('clearEdits').addEventListener('click', act(() => client.editAction('clear')));
  $('rerun').addEventListener('click', () => { void host.rerun().then(reload).catch(fail); });
  $('rerunFrom').addEventListener('click', () => { void host.rerun($<HTMLSelectElement>('fromStage').value).then(reload).catch(fail); });
  $('cancelRun').addEventListener('click', () => client.cancel());
  autoRun.addEventListener('change', () => { if (autoRun.checked && stale.length) void host.rerun().then(reload).catch(fail); });

  return {
    async refresh() { ready = true; fillTools(); await reload(); },
    state: () => ({ tool: toolSel.value, edits: log?.length ?? 0, cursor: log?.cursor ?? 0, stale, sent, ring: { globe: globe?.ringPoints() ?? 0, flat: ui.ringPath() } }),
  };
}
