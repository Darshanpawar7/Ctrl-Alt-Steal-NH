import { lazy, Suspense } from "react";
import { Logo } from "./components/Logo";
import { ToastProvider } from "./components/ui";
import { linkTo, usePath } from "./lib/router";

// Each surface loads separately, so phones never download the admin panel.
const Landing = lazy(() => import("./pages/Landing"));
const Register = lazy(() => import("./pages/Register"));
const Play = lazy(() => import("./pages/play/Play"));
const Screen = lazy(() => import("./pages/screen/Screen"));
const Admin = lazy(() => import("./pages/admin/Admin"));

function route(path: string) {
  if (path === "/" || path === "") return <Landing />;
  if (path === "/register") return <Register />;
  if (path.startsWith("/play")) return <Play />;
  if (path.startsWith("/screen")) return <Screen />;
  if (path.startsWith("/admin")) return <Admin />;
  return <NotFound />;
}

export function App() {
  const path = usePath();
  return (
    <ToastProvider>
      <Suspense fallback={<Boot />}>{route(path)}</Suspense>
    </ToastProvider>
  );
}

export function Boot({ text = "Decrypting…" }: { text?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-hex">
      <div className="flex flex-col items-center gap-6">
        <Logo size="md" animate />
        <p className="label">
          {text}
          <span className="blink">_</span>
        </p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <main className="grain grid min-h-dvh place-items-center bg-hex px-6 text-center">
      <div>
        <p className="font-display text-[clamp(6rem,30vw,16rem)] leading-none font-black text-outline">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold">This page was stolen too.</h1>
        <p className="mt-2 text-muted">Whoever did it left no clues. Head back to base.</p>
        <a href="/" onClick={linkTo("/")} className="keycap keycap-honey mt-8">
          Back to base
        </a>
      </div>
    </main>
  );
}
