import confetti from "canvas-confetti";
import { useState, type FormEvent } from "react";
import type { RegisterResult } from "../../shared/protocol";
import type { Member } from "../../shared/types";
import { Logo } from "../components/Logo";
import { errorText } from "../components/ui";
import { postJson, usePublicInfo } from "../lib/api";
import { formatCode } from "../lib/format";
import { linkTo } from "../lib/router";

export const TEAM_EMOJIS = ["🐝", "🦝", "🦊", "🐙", "👻", "🤖", "🦉", "🐍", "🦈", "🐺", "🦄", "🐸", "🔥", "⚡", "🧠", "🕶️"];

const NAME_IDEAS = [
  "Gradient Gangsters", "The Overfitters", "Null Pointers", "Kernel Panic", "Tensor Thieves", "Loss Leaders",
  "Prompt Injectors", "Random Forest Gump", "Backprop Bandits", "Sudo Sleuths", "Cache Me If You Can",
  "Epoch Eagles", "Ctrl+Z Squad", "Batch Normies", "The Hallucinators", "Attention Seekers", "Vanishing Gradients",
  "Stack Overflowers", "Bit Flippers", "Honey Heisters",
];

const blankMember = (): Member => ({ name: "", srn: "" });

export default function Register() {
  const { info } = usePublicInfo();
  const min = info?.event.minMembers ?? 3;
  const max = info?.event.maxMembers ?? 4;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🐝");
  const [members, setMembers] = useState<Member[]>(() => Array.from({ length: 3 }, blankMember));
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<RegisterResult["team"] | null>(null);

  const filled = members.filter((m) => m.name.trim());
  const closed = info && !info.event.registrationOpen;

  function updateMember(index: number, patch: Partial<Member>) {
    setMembers((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function suggestName() {
    const options = NAME_IDEAS.filter((n) => n !== name);
    setName(options[Math.floor(Math.random() * options.length)]!);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (filled.length < min) return setError(`Add at least ${min} members.`);
    if (!agreed) return setError("Tick the fair-play pledge to continue.");
    setBusy(true);
    try {
      const result = await postJson<RegisterResult>("/api/register", { name, emoji, members: filled, contact, website: honeypot });
      setDone(result.team);
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.4 }, colors: ["#ffb627", "#b6ff3b", "#ff3b6b", "#5ce1ff"] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Success team={done} />;

  return (
    <div className="grain relative min-h-dvh overflow-x-clip bg-hex">
      <div className="absolute -top-40 right-0 size-[600px] rounded-full bg-honey/10 blur-[140px]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="/" onClick={linkTo("/")}>
          <Logo size="sm" />
        </a>
        <a href="/play" onClick={linkTo("/play")} className="text-sm font-semibold text-muted hover:text-paper">
          Already registered? Join →
        </a>
      </header>

      <main className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-6 pb-24 sm:px-6 lg:grid-cols-[1fr_380px]">
        <section>
          <p className="label text-alarm">Form NH-7 · Agent recruitment</p>
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] leading-none font-black">Assemble your crew.</h1>
          <p className="mt-4 max-w-lg text-muted">
            {min === max ? min : `${min} to ${max}`} agents per crew. You'll get a team code at the end: that's your key into the game.
          </p>

          {closed ? (
            <div className="panel mt-10 p-6">
              <p className="font-display text-xl font-bold">Registration is closed.</p>
              <p className="mt-2 text-muted">Talk to the organisers at the desk. Walk-ins can still be added there.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-10 space-y-8" noValidate>
              <fieldset className="space-y-3">
                <label htmlFor="team-name" className="label">
                  Crew name
                </label>
                <div className="flex gap-2">
                  <input
                    id="team-name"
                    className="field text-lg font-semibold"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="e.g. Gradient Gangsters"
                    required
                    autoComplete="off"
                  />
                  <button type="button" className="keycap shrink-0 text-lg" onClick={suggestName} title="Suggest a name" aria-label="Suggest a name">
                    🎲
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend className="label">Crew sigil</legend>
                <div className="mt-3 grid grid-cols-8 gap-2">
                  {TEAM_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoji(e)}
                      aria-pressed={emoji === e}
                      className={`grid aspect-square place-items-center rounded-xl border text-2xl transition ${
                        emoji === e ? "scale-110 border-honey bg-honey/15 shadow-[0_0_20px] shadow-honey/30" : "border-line bg-panel hover:border-line-2"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="label">Agents</legend>
                {members.map((member, index) => (
                  <div key={index} className="grid grid-cols-[2rem_1fr_9rem] items-center gap-2 sm:grid-cols-[2rem_1fr_11rem]">
                    <span className="font-mono text-sm text-dim">0{index + 1}</span>
                    <input
                      className="field"
                      placeholder={index === 0 ? "Captain's full name" : "Full name"}
                      value={member.name}
                      onChange={(e) => updateMember(index, { name: e.target.value })}
                      maxLength={60}
                      aria-label={`Agent ${index + 1} name`}
                    />
                    <input
                      className="field font-mono uppercase"
                      placeholder="SRN"
                      value={member.srn}
                      onChange={(e) => updateMember(index, { srn: e.target.value })}
                      maxLength={30}
                      aria-label={`Agent ${index + 1} SRN`}
                    />
                  </div>
                ))}
                <div className="flex gap-2 pl-10">
                  {members.length < max && (
                    <button type="button" className="keycap text-xs" onClick={() => setMembers((l) => [...l, blankMember()])}>
                      + Add agent
                    </button>
                  )}
                  {members.length > min && (
                    <button type="button" className="keycap text-xs" onClick={() => setMembers((l) => l.slice(0, -1))}>
                      − Remove
                    </button>
                  )}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <label htmlFor="contact" className="label">
                  Captain's phone or email
                </label>
                <input id="contact" className="field" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="So we can reach you on the day" />
              </fieldset>

              {/* Honeypot: hidden from people, irresistible to bots. */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="absolute -left-[9999px] size-px opacity-0"
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-4">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 accent-honey" />
                <span className="text-sm text-muted">
                  <span className="font-semibold text-paper">Fair-play pledge.</span> No sharing answers with other crews, and no AI tools or internet
                  searches during rounds. We know. The irony is intentional.
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm text-alarm">
                  {error}
                </p>
              )}

              <button type="submit" className="keycap keycap-honey w-full text-lg sm:w-auto" disabled={busy}>
                {busy ? "Issuing code…" : "Issue our team code →"}
              </button>
            </form>
          )}
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <AgentBadge name={name} emoji={emoji} members={filled.map((m) => m.name)} />
        </aside>
      </main>
    </div>
  );
}

function AgentBadge({ name, emoji, members }: { name: string; emoji: string; members: string[] }) {
  return (
    <div className="relative mx-auto max-w-sm rotate-[1.5deg]">
      <div className="mx-auto h-10 w-6 rounded-b-md border-x-4 border-b-4 border-line-2" aria-hidden />
      <div className="panel overflow-hidden">
        <div className="tape h-3" />
        <div className="relative p-6">
          <div className="shimmer pointer-events-none absolute inset-0" />
          <p className="label">Neural Hive · Recovery unit</p>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid size-20 place-items-center rounded-2xl border border-honey/40 bg-honey/10 text-5xl">{emoji}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-black">{name || "Your crew"}</p>
              <p className="font-mono text-xs text-honey">CODE: ███-███</p>
            </div>
          </div>
          <ul className="mt-6 space-y-1.5 font-mono text-sm">
            {(members.length ? members : ["Agent 01", "Agent 02", "Agent 03"]).map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-paper/80">
                <span className="text-dim">0{i + 1}</span>
                <span className="truncate">{m}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-end justify-between">
            <span className="stamp text-xs text-acid">Cleared</span>
            <div className="flex gap-0.5" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} className="w-[2px] bg-paper/70" style={{ height: 14 + ((i * 7) % 12) }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Success({ team }: { team: RegisterResult["team"] }) {
  const pretty = formatCode(team.code);
  return (
    <main className="grain grid min-h-dvh place-items-center bg-hex px-4 py-16">
      <div className="w-full max-w-2xl text-center">
        <p className="text-6xl">{team.emoji}</p>
        <p className="label mt-6 text-acid">Crew registered</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.4rem)] leading-none font-black">Welcome, {team.name}.</h1>
        <p className="mt-6 text-muted">This is your team code. Screenshot it now. You'll show it at the check-in desk and type it into your phone to play.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-2 sm:gap-3" aria-label={`Team code ${pretty}`}>
          {pretty.split("").map((ch, i) =>
            ch === "-" ? (
              <span key={i} className="self-center font-display text-3xl text-dim">–</span>
            ) : (
              <span key={i} className="keycap keycap-honey rise min-w-[1.6em] text-3xl sm:text-5xl" style={{ animationDelay: `${i * 70}ms` }}>
                {ch}
              </span>
            ),
          )}
        </div>
        <div className="mt-14 flex flex-wrap justify-center gap-4">
          <a href={`/play?code=${team.code}`} onClick={linkTo(`/play?code=${team.code}`)} className="keycap keycap-honey">
            Open the agent console →
          </a>
          <a href="/" onClick={linkTo("/")} className="keycap">
            Back to base
          </a>
        </div>
      </div>
    </main>
  );
}
