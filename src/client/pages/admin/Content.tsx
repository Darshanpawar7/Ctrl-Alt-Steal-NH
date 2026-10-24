import { useEffect, useState } from "react";
import type { AdminSecrets, ContentSection } from "../../../shared/protocol";
import type { CaseFile, Evidence, EvidenceKind, FinaleConfig, R1Config, R2Config, R3Config, R4Config, RoundBase } from "../../../shared/types";
import { ConfirmButton, SectionLabel, errorText, useToast } from "../../components/ui";
import { apiUrl } from "../../lib/api";
import { ROUND_LABEL } from "../../lib/format";
import { adminFetch, useStaff } from "./context";
import { Check, Grid, Lines, ListEditor, Num, Pick, Text } from "./fields";

const SECTIONS: { id: ContentSection; label: string }[] = [
  { id: "caseFile", label: "The case" },
  { id: "r1", label: "R1 · Trading Floor" },
  { id: "r2", label: "R2 · Training Log" },
  { id: "r3", label: "R3 · Lineup" },
  { id: "r4", label: "R4 · Vault" },
  { id: "finale", label: "Finale" },
];

type SectionValue = CaseFile | R1Config | R2Config | R3Config | R4Config | FinaleConfig;

function pickSection(state: AdminSecrets, section: ContentSection): SectionValue {
  return section === "caseFile" ? state.caseFile : state.rounds[section];
}

const slug = () => Math.random().toString(36).slice(2, 8);

export default function Content() {
  const { view } = useStaff();
  const [section, setSection] = useState<ContentSection>("caseFile");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-black">Case & content</h1>
        <p className="text-muted">Edit the mystery, every round, the answer keys and the payouts. Changes reach every screen the moment you save.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`keycap text-sm ${section === s.id ? "keycap-honey" : ""}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {view.full && <SectionEditor key={section} section={section} saved={pickSection(view.full, section)} />}
    </div>
  );
}

function SectionEditor({ section, saved }: { section: ContentSection; saved: SectionValue }) {
  const { view, act } = useStaff();
  const toast = useToast();
  const [draft, setDraft] = useState<SectionValue>(() => structuredClone(saved));
  const [json, setJson] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const live = section !== "caseFile" && view.status[section] === "open";

  // When someone else saves this section, follow along unless we have edits.
  useEffect(() => {
    if (!dirty) setDraft(structuredClone(saved));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    let value: unknown = draft;
    if (json !== null) {
      try {
        value = JSON.parse(json);
      } catch (error) {
        return toast(`That JSON has an error: ${errorText(error)}`, "bad");
      }
    }
    if (await act({ type: "content.set", section, value })) {
      toast("Saved. Every screen has the new version.", "good");
      setJson(null);
    }
  }

  const set = <T,>(patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch }) as SectionValue);

  return (
    <div className="space-y-5">
      {live && <p className="rounded-xl border border-alarm/50 bg-alarm/10 px-4 py-3 text-sm text-alarm">⚠ This round is live right now. Saving changes it on every phone immediately.</p>}
      <div className="sticky top-[62px] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/95 p-3 backdrop-blur">
        <span className={`text-sm ${dirty || json !== null ? "text-honey" : "text-muted"}`}>{dirty || json !== null ? "● Unsaved changes" : "All changes saved"}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="keycap text-xs" onClick={() => setJson(json === null ? JSON.stringify(draft, null, 2) : null)}>
            {json === null ? "{ } Edit as JSON" : "Back to form"}
          </button>
          <ConfirmButton className="keycap text-xs" confirmLabel="Discard edits?" disabled={!dirty && json === null} onConfirm={() => { setDraft(structuredClone(saved)); setJson(null); }}>
            Discard
          </ConfirmButton>
          <button type="button" className="keycap keycap-honey text-xs" disabled={!dirty && json === null} onClick={save}>
            Save {section === "caseFile" ? "case" : ROUND_LABEL[section]}
          </button>
        </span>
      </div>

      {json !== null ? (
        <textarea className="field min-h-[70vh] font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
      ) : section === "caseFile" ? (
        <CaseEditor value={draft as CaseFile} set={set<CaseFile>} />
      ) : (
        <div className="space-y-6">
          <BaseEditor value={draft as RoundBase} set={set<RoundBase>} />
          {section === "r1" && <R1Editor value={draft as R1Config} set={set<R1Config>} />}
          {section === "r2" && <R2Editor value={draft as R2Config} set={set<R2Config>} />}
          {section === "r3" && <R3Editor value={draft as R3Config} set={set<R3Config>} />}
          {section === "r4" && <R4Editor value={draft as R4Config} set={set<R4Config>} />}
          {section === "finale" && <FinaleEditor value={draft as FinaleConfig} set={set<FinaleConfig>} />}
        </div>
      )}
    </div>
  );
}

type SetFn<T> = (patch: Partial<T>) => void;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-4 p-5">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- the case

function CaseEditor({ value, set }: { value: CaseFile; set: SetFn<CaseFile> }) {
  const options = (list: { id: string; name: string }[]) => list.map((o) => ({ value: o.id, label: o.name || o.id }));
  return (
    <div className="space-y-6">
      <Card title="Story">
        <Grid>
          <Text label="Model name" value={value.modelName} onChange={(modelName) => set({ modelName })} />
          <Text label="Headline" value={value.headline} onChange={(headline) => set({ headline })} />
        </Grid>
        <Text label="Story (blank line between paragraphs)" area rows={8} value={value.story.join("\n\n")} onChange={(v) => set({ story: v.split(/\n\s*\n/) })} />
      </Card>

      <Card title="🔐 Solution">
        <Grid cols={3}>
          <Pick label="Thief" value={value.solution.thiefId} options={options(value.suspects)} onChange={(thiefId) => set({ solution: { ...value.solution, thiefId } })} />
          <Pick label="Hideout" value={value.solution.locationId} options={options(value.locations)} onChange={(locationId) => set({ solution: { ...value.solution, locationId } })} />
          <Pick label="Recovery" value={value.solution.methodId} options={options(value.methods)} onChange={(methodId) => set({ solution: { ...value.solution, methodId } })} />
        </Grid>
        <p className="text-xs text-muted">If you change the answer, rewrite the clues below so they still point to exactly one answer.</p>
      </Card>

      <Card title="Clues (shown after each reveal)">
        {(["r1", "r2", "r3", "bonus"] as const).map((key) => (
          <div key={key} className="grid gap-2 rounded-xl border border-line p-3">
            <Text label={key === "bonus" ? "Bonus clue title (Vault winners only)" : `${ROUND_LABEL[key]} clue title`} value={value.clues[key].title} onChange={(title) => set({ clues: { ...value.clues, [key]: { ...value.clues[key], title } } })} />
            <Text label="Clue text" area value={value.clues[key].text} onChange={(text) => set({ clues: { ...value.clues, [key]: { ...value.clues[key], text } } })} />
          </div>
        ))}
      </Card>

      <Card title="The reveal (read out at the end)">
        {(["thief", "location", "method", "epilogue"] as const).map((key) => (
          <Text key={key} label={key} area value={value.reveal[key]} onChange={(text) => set({ reveal: { ...value.reveal, [key]: text } })} />
        ))}
      </Card>

      <Card title="Timeline">
        <ListEditor title="Facts" items={value.facts} onChange={(facts) => set({ facts })} make={() => ({ time: "00:00", text: "" })} render={(f, u) => (
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <Text label="Time" value={f.time} onChange={(time) => u({ time })} />
            <Text label="What happened" value={f.text} onChange={(text) => u({ text })} />
          </div>
        )} />
      </Card>

      <Card title="Suspects">
        <ListEditor title="Suspects" items={value.suspects} max={12} onChange={(suspects) => set({ suspects })} make={() => ({ id: slug(), name: "", alias: "", role: "", emoji: "🕵️", bio: "", traits: [] })} render={(s, u) => (
          <>
            <Grid cols={4}>
              <Text label="Name" value={s.name} onChange={(name) => u({ name })} />
              <Text label="Alias" value={s.alias} onChange={(alias) => u({ alias })} />
              <Text label="Emoji" value={s.emoji} onChange={(emoji) => u({ emoji })} />
              <Text label="Id (don't change mid-game)" mono value={s.id} onChange={(id) => u({ id })} />
            </Grid>
            <Text label="Role" value={s.role} onChange={(role) => u({ role })} />
            <Text label="Bio" area value={s.bio} onChange={(bio) => u({ bio })} />
            <Lines label="Traits" value={s.traits} onChange={(traits) => u({ traits })} rows={3} />
          </>
        )} />
      </Card>

      {(["locations", "methods"] as const).map((key) => (
        <Card key={key} title={key === "locations" ? "Hideouts" : "Recovery methods"}>
          <ListEditor title={key} items={value[key]} max={12} onChange={(items) => set({ [key]: items })} make={() => ({ id: slug(), name: "", emoji: "❓", detail: "" })} render={(o, u) => (
            <>
              <Grid cols={3}>
                <Text label="Name" value={o.name} onChange={(name) => u({ name })} />
                <Text label="Emoji" value={o.emoji} onChange={(emoji) => u({ emoji })} />
                <Text label="Id" mono value={o.id} onChange={(id) => u({ id })} />
              </Grid>
              <Text label="Detail" value={o.detail} onChange={(detail) => u({ detail })} />
            </>
          )} />
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- rounds

function BaseEditor({ value, set }: { value: RoundBase; set: SetFn<RoundBase> }) {
  return (
    <Card title="Round basics">
      <Grid cols={3}>
        <Text label="Title" value={value.title} onChange={(title) => set({ title })} />
        <Text label="Codename" value={value.codename} onChange={(codename) => set({ codename })} />
        <Num label="Timer (minutes)" step={0.5} value={value.durationSec / 60} onChange={(m) => set({ durationSec: Math.round(m * 60) })} />
      </Grid>
      <Text label="Tagline" value={value.tagline} onChange={(tagline) => set({ tagline })} />
      <Lines label="How to play" value={value.howTo} onChange={(howTo) => set({ howTo })} />
      <ListEditor title="Hints teams can buy" items={value.hints} max={6} onChange={(hints) => set({ hints })} make={() => ({ text: "", cost: 50 })} render={(h, u) => (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Text label="Hint" value={h.text} onChange={(text) => u({ text })} />
          <Num label="Cost" value={h.cost} onChange={(cost) => u({ cost })} />
        </div>
      )} />
    </Card>
  );
}

function R1Editor({ value, set }: { value: R1Config; set: SetFn<R1Config> }) {
  return (
    <Card title="Leads">
      <Num label="Max credits a crew can stake" value={value.maxStake} onChange={(maxStake) => set({ maxStake })} />
      <ListEditor title="Leads" items={value.leads} max={16} onChange={(leads) => set({ leads })} make={() => ({ id: slug(), source: "", text: "", odds: 2, real: false })} render={(l, u) => (
        <>
          <Grid cols={3}>
            <Text label="Source" value={l.source} onChange={(source) => u({ source })} />
            <Num label="Odds (payout ×)" step={0.5} value={l.odds} onChange={(odds) => u({ odds })} />
            <div className="pt-6">
              <Check label="🔐 This lead is REAL" value={l.real} onChange={(real) => u({ real })} />
            </div>
          </Grid>
          <Text label="Lead text" area rows={2} value={l.text} onChange={(text) => u({ text })} />
        </>
      )} />
    </Card>
  );
}

function R2Editor({ value, set }: { value: R2Config; set: SetFn<R2Config> }) {
  return (
    <>
      <Card title="The log">
        <Text label="Training log (shown as a terminal)" area mono rows={16} value={value.log} onChange={(log) => set({ log })} />
        <Text label="Speed bonus for 1st, 2nd, 3rd… (comma separated)" value={value.speedBonus.join(", ")} onChange={(v) => set({ speedBonus: v.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0) })} />
      </Card>
      <Card title="Questions">
        <ListEditor title="Questions" items={value.questions} max={8} onChange={(questions) => set({ questions })} make={() => ({ id: slug(), prompt: "", placeholder: "", answers: [], points: 100 })} render={(q, u) => (
          <>
            <Text label="Question" value={q.prompt} onChange={(prompt) => u({ prompt })} />
            <Grid cols={3}>
              <Text label="🔐 Accepted answers (comma separated)" value={q.answers.join(", ")} onChange={(v) => u({ answers: v.split(",").map((a) => a.trim()) })} />
              <Text label="Placeholder" value={q.placeholder} onChange={(placeholder) => u({ placeholder })} />
              <Num label="Points" value={q.points} onChange={(points) => u({ points })} />
            </Grid>
            <p className="text-xs text-muted">Matching ignores case, spaces and punctuation: “Hello-World” matches “helloworld”.</p>
          </>
        )} />
      </Card>
    </>
  );
}

const KINDS: { value: EvidenceKind; label: string }[] = [
  { value: "chat", label: "Chat message" },
  { value: "post", label: "Social post" },
  { value: "email", label: "Email" },
  { value: "log", label: "System log" },
  { value: "statement", label: "Statement / document" },
  { value: "photo", label: "Photo" },
];

function R3Editor({ value, set }: { value: R3Config; set: SetFn<R3Config> }) {
  const { view } = useStaff();
  const suspects = view.full?.caseFile.suspects ?? [];
  return (
    <Card title="Evidence">
      <Grid>
        <Num label="Credits per correct call" value={value.pointsCorrect} onChange={(pointsCorrect) => set({ pointsCorrect })} />
        <Num label="Credits lost per wrong call" value={value.pointsWrong} onChange={(pointsWrong) => set({ pointsWrong })} />
      </Grid>
      <p className="text-sm text-muted">
        Tip: mix real photos with AI-generated ones. Uploads are resized to 1280px and saved the same way, with hidden details (camera, location, “made with AI” labels) removed, so the file can't give the answer away. Each item can have text, an image, or both.
      </p>
      <ListEditor<Evidence> title="Evidence" items={value.items} max={16} onChange={(items) => set({ items })} make={() => ({ id: slug(), suspectId: suspects[0]?.id ?? "", kind: "photo", title: "", meta: "", body: "", image: "", fake: false, tell: "" })} render={(it, u) => (
        <>
          <Grid cols={3}>
            <Text label="Title" value={it.title} onChange={(title) => u({ title })} />
            <Pick label="Suspect" value={it.suspectId} options={suspects.map((s) => ({ value: s.id, label: s.name }))} onChange={(suspectId) => u({ suspectId })} />
            <Pick label="Looks like" value={it.kind} options={KINDS} onChange={(kind) => u({ kind })} />
          </Grid>
          <Text label="Meta line (sender, time, place)" value={it.meta} onChange={(meta) => u({ meta })} />
          <Text label="Body text" area value={it.body} onChange={(body) => u({ body })} />
          <ImageField value={it.image} onChange={(image) => u({ image })} />
          <Grid>
            <Check label="🔐 This is an AI FAKE" value={it.fake} onChange={(fake) => u({ fake })} />
          </Grid>
          <Text label="🔐 The tell (explained at the reveal)" area rows={2} value={it.tell} onChange={(tell) => u({ tell })} />
        </>
      )} />
    </Card>
  );
}

/** Uploads an image to the game server after shrinking it in the browser. */
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { password } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const src = /^[a-z0-9]{10}$/.test(value) ? apiUrl(`/api/img/${value}`) : value;

  async function upload(file: File) {
    setBusy(true);
    try {
      const blob = await shrink(file, 1280);
      const response = await adminFetch(password, "/api/admin/upload", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const { id } = (await response.json()) as { id: string };
      onChange(id);
    } catch (error) {
      toast(errorText(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <Text label="Image (upload, or paste an https:// link)" value={value} onChange={onChange} placeholder="none" />
      <label className="keycap cursor-pointer text-xs">
        {busy ? "Uploading…" : "⬆ Upload"}
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {/^https?:/i.test(value) && (
        <p className="text-xs text-alarm sm:col-span-2">A link keeps the original file, and its address can show where the photo came from. Download it and upload it here instead.</p>
      )}
      {src && <img src={src} alt="" className="max-h-40 rounded-xl border border-line object-contain sm:col-span-2" />}
    </div>
  );
}

/**
 * Redraws the photo (at most `maxSide` px) as a JPEG. Redrawing drops every hidden detail
 * (camera, location, "made with AI" labels), and every photo ends up the same kind of file,
 * so neither the details nor the file type can give away which evidence is real.
 */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that image. Save it as a JPEG or PNG and try again.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency: see-through images get white behind them instead of black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.88));
}

function R4Editor({ value, set }: { value: R4Config; set: SetFn<R4Config> }) {
  const total = value.prizes.reduce((n, p) => n + p.count, 0);
  return (
    <Card title="Vault">
      <Grid cols={3}>
        <Text label="Doors (comma separated)" value={value.doors.join(", ")} onChange={(v) => set({ doors: v.split(",").map((d) => d.trim().toUpperCase()).filter(Boolean) })} />
        <Num label="Max wager (% of credits)" value={value.maxWagerPct} onChange={(maxWagerPct) => set({ maxWagerPct })} />
        <Num label="Minimum wager" value={value.minWager} onChange={(minWager) => set({ minWager })} />
      </Grid>
      {total !== value.doors.length && (
        <p className="rounded-xl border border-alarm/50 bg-alarm/10 px-4 py-2 text-sm text-alarm">
          Prize counts add up to {total} but there are {value.doors.length} doors. Make them match.
        </p>
      )}
      <ListEditor title="Prizes" items={value.prizes} max={8} onChange={(prizes) => set({ prizes })} make={() => ({ label: "", emoji: "🎁", flavor: "", multiplier: 1, count: 1, clue: false })} render={(p, u) => (
        <>
          <Grid cols={4}>
            <Text label="Label" value={p.label} onChange={(label) => u({ label })} />
            <Text label="Emoji" value={p.emoji} onChange={(emoji) => u({ emoji })} />
            <Num label="Wager comes back ×" step={0.5} value={p.multiplier} onChange={(multiplier) => u({ multiplier })} />
            <Num label="How many doors" value={p.count} onChange={(count) => u({ count })} />
          </Grid>
          <Text label="Flavour text" value={p.flavor} onChange={(flavor) => u({ flavor })} />
          <Check label="Unlocks the bonus clue" value={p.clue} onChange={(clue) => u({ clue })} />
        </>
      )} />
      <p className="text-xs text-muted">Doors are dealt at random when the round opens. You can reassign or reshuffle them on the Rounds page before any door opens.</p>
    </Card>
  );
}

function FinaleEditor({ value, set }: { value: FinaleConfig; set: SetFn<FinaleConfig> }) {
  const p = value.payout;
  return (
    <Card title="Final bet payouts (bet comes back ×)">
      <Grid cols={4}>
        <Num label="3 of 3 right" step={0.5} value={p.three} onChange={(three) => set({ payout: { ...p, three } })} />
        <Num label="2 of 3 right" step={0.5} value={p.two} onChange={(two) => set({ payout: { ...p, two } })} />
        <Num label="1 of 3 right" step={0.5} value={p.one} onChange={(one) => set({ payout: { ...p, one } })} />
        <Num label="0 of 3 right" step={0.5} value={p.zero} onChange={(zero) => set({ payout: { ...p, zero } })} />
      </Grid>
      <p className="text-xs text-muted">×1 means they get their bet back. ×0 means they lose it.</p>
    </Card>
  );
}
