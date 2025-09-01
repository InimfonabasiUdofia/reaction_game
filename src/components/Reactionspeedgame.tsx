import  { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";



export default function ReactionSpeedGame() {
  // ----------- CONFIG -----------
  const BASE_ROUND_MS = 1300; // starting time per round in ms
  const MIN_ROUND_MS = 450; // floor of difficulty
  const DECAY_PER_ROUND = 55; // time reduced per round
  const COUNTDOWN_FROM = 3; // 3..2..1..Go
  const TARGET_SIZE = 72; // px (approx, responsive container adjusts)
  const BOARD_PADDING = 16; // px padding within the board
  const LOCALSTORAGE_KEY = "reaction_speed_best";
  const SFX_ENABLED_DEFAULT = true;

  // ----------- STATE -----------
  const [phase, setPhase] = useState("idle"); // idle | countdown | running | paused | gameover
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    const v = localStorage.getItem(LOCALSTORAGE_KEY);
    return v ? parseInt(v, 10) : 0;
  });
  const [sfx, setSfx] = useState(SFX_ENABLED_DEFAULT);
  const [roundMs, setRoundMs] = useState(BASE_ROUND_MS);
  const [timeLeft, setTimeLeft] = useState(BASE_ROUND_MS);
  const [target, setTarget] = useState({ x: 50, y: 50, shape: "circle" });

  // Pausing logic
  const [isPaused, setIsPaused] = useState(false);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);

  // Board size tracking for responsive random positions
  const boardRef = useRef(null);
  const [boardRect, setBoardRect] = useState({ width: 320, height: 400 });



  // ----------- AUDIO (WebAudio beep) -----------
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.AudioContext;
      if (AudioCtx) ctxRef.current = new AudioCtx();
    }
  }, []);

  const beep = useCallback((type = "success") => {
    if (!sfx) return;
    ensureAudio();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    const now = ctx.currentTime;
    const dur = 0.08;
    if (type === "success") {
      o.frequency.setValueAtTime(880, now);
      o.frequency.exponentialRampToValueAtTime(1320, now + dur);
    } else if (type === "fail") {
      o.frequency.setValueAtTime(220, now);
      o.frequency.exponentialRampToValueAtTime(110, now + dur);
    } else {
      o.frequency.setValueAtTime(660, now);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(now + dur + 0.02);
  }, [sfx, ensureAudio]);

  // ----------- HELPERS -----------
  const computeRoundMs = useCallback((r: number) => {
    return Math.max(MIN_ROUND_MS, BASE_ROUND_MS - (r - 1) * DECAY_PER_ROUND);
  }, []);

  const randomTarget = useCallback(() => {
    const { width, height } = boardRect;
    const maxX = Math.max(0, width - TARGET_SIZE - BOARD_PADDING * 2);
    const maxY = Math.max(0, height - TARGET_SIZE - BOARD_PADDING * 2);
    const x = Math.floor(Math.random() * maxX) + BOARD_PADDING;
    const y = Math.floor(Math.random() * maxY) + BOARD_PADDING;
    const shapes = ["circle", "square", "diamond"];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    return { x, y, shape };
  }, [boardRect]);

  const startCountdown = useCallback(() => {
    setScore(0);
    setRound(1);
    setRoundMs(BASE_ROUND_MS);
    setCountdown(COUNTDOWN_FROM);
    setPhase("countdown");
  }, []);

  const startRound = useCallback((r: number) => {
    const ms = computeRoundMs(r);
    setRoundMs(ms);
    setTimeLeft(ms);
    setTarget(randomTarget());
    setPhase("running");
    startedAtRef.current = performance.now();
  }, [computeRoundMs, randomTarget]);

  const handleHit = useCallback(() => {
    if (phase !== "running" || isPaused) return;
    beep("success");
    setScore((s) => s + 1);
    setRound((r) => r + 1);
    // Immediately start next round
    const next = round + 1;
    startRound(next);
  }, [phase, isPaused, beep, startRound, round]);

  const handleMiss = useCallback(() => {
    beep("fail");
    setPhase("gameover");
    setBest((prev) => {
      const newBest = Math.max(prev, score);
      localStorage.setItem(LOCALSTORAGE_KEY, String(newBest));
      return newBest;
    });
  }, [beep, score]);

  const togglePause = useCallback(() => {
    if (phase !== "running") return;
    setIsPaused((p) => !p);
  }, [phase]);

  const restart = useCallback(() => {
    setIsPaused(false);
    startCountdown();
  }, [startCountdown]);

  // ----------- TICK (timer) -----------
  useEffect(() => {
    if (phase !== "running" || isPaused) return;

    const loop = () => {
      const now = performance.now();
      const elapsed = now - startedAtRef.current;
      const left = Math.max(0, roundMs - elapsed);
      setTimeLeft(left);
      if (left <= 0) {
        cancelAnimationFrame(rafRef.current);
        handleMiss();
      } else {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, isPaused, roundMs, handleMiss]);

  // ----------- COUNTDOWN -----------
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === COUNTDOWN_FROM) beep("tick");
    if (countdown <= 0) {
      setCountdown(COUNTDOWN_FROM);
      setPhase("running");
      startRound(1);
      return;
    }
    const t = setTimeout(() => {
      setCountdown((c) => c - 1);
      beep("tick");
    }, 650);
    return () => clearTimeout(t);
  }, [phase, countdown, beep, startRound]);

  // ----------- RESIZE OBSERVER -----------
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setBoardRect({ width: cr.width, height: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ----------- UI COMPUTED -----------
  const progress = Math.max(0, Math.min(1, timeLeft / roundMs));
  const prettyPhase =
    phase === "idle"
      ? "Ready"
      : phase === "countdown"
      ? "Get Ready"
      : phase === "running"
      ? isPaused
        ? "Paused"
        : "Go!"
      : phase === "gameover"
      ? "Game Over"
      : "";

  // ----------- RENDER -----------
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>

            <p className="text-slate-300">Tap the target before the bar empties. It gets faster every round.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSfx((v) => !v)}
              className={`px-3 py-2 rounded-2xl shadow-sm text-sm font-semibold transition border border-white/10 hover:border-white/20 ${
                sfx ? "bg-emerald-600/20" : "bg-slate-700/40"
              }`}
            >
              {sfx ? "🔊 SFX On" : "🔈 SFX Off"}
            </button>
            <button
              onClick={restart}
              className="px-3 py-2 rounded-2xl shadow-sm text-sm font-semibold transition bg-indigo-600 hover:bg-indigo-500"
            >
              Restart
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Round" value={round} />
          <Stat label="Score" value={score} />
          <Stat label="Best" value={best} />
          <Stat label="State" value={prettyPhase} />
        </div>

        {/* Timer Bar */}
        <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden shadow-inner mb-3">
          <motion.div
            key={`${round}-${isPaused}-${phase}`}
            initial={{ width: "100%" }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
            className={`h-full ${
              progress > 0.5 ? "bg-emerald-400" : progress > 0.25 ? "bg-amber-400" : "bg-rose-400"
            }`}
          />
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          className="relative w-full aspect-[4/5] sm:aspect-[16/9] rounded-3xl bg-slate-800/60 border border-white/10 shadow-xl overflow-hidden backdrop-blur"
        >
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px] opacity-60 pointer-events-none" />

          {/* Center overlays */}
          <div className="absolute inset-0 flex items-center justify-center">
            {phase === "idle" && (
              <motion.button
                onClick={startCountdown}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-semibold shadow-lg"
              >
                Start Game
              </motion.button>
            )}

            {phase === "countdown" && (
              <motion.div
                key={countdown}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="text-7xl font-black drop-shadow"
              >
                {countdown > 0 ? countdown : "Go!"}
              </motion.div>
            )}

            {phase === "gameover" && (
              <GameOverCard score={score} best={best} onRestart={restart} />)
            }

            {phase === "running" && isPaused && (
              <PausedCard onResume={() => setIsPaused(false)} onRestart={restart} />
            )}
          </div>

          {/* Target */}
          <AnimatePresence>
            {phase === "running" && !isPaused && (
              <motion.button
                key={`${target.x}-${target.y}-${target.shape}-${round}`}
                onClick={handleHit}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute focus:outline-none"
                style={{ left: target.x, top: target.y }}
              >
                <Target shape={target.shape} size={TARGET_SIZE} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Controls overlay */}
          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3">
            {phase === "running" && (
              <button
                onClick={togglePause}
                className="px-4 py-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 border border-white/10 backdrop-blur text-sm font-medium"
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
            )}
          </div>
        </div>

        {/* Leaderboard (mock) */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      

          <div className="rounded-3xl border border-white/10 bg-slate-800/60 p-4 shadow">
            <h2 className="text-lg font-semibold mb-2">How to Play</h2>
            <ul className="space-y-1 text-sm text-slate-300 list-disc pl-5">
              <li>Press <span className="font-semibold">Start Game</span> and wait for the countdown.</li>
              <li>Click/tap the glowing target before the bar empties.</li>
              <li>Each hit speeds up the game. Miss = Game Over.</li>
              <li>Use <span className="font-semibold">Pause</span> to take a break.</li>
              <li>Best score saves automatically in your browser.</li>
            </ul>
          </div>
        </div>

     
      </div>
    </div>
  );
}

function Stat({ label, value }:any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function GameOverCard({ score, best, onRestart }:any) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="rounded-3xl bg-slate-900/80 backdrop-blur border border-white/10 p-6 text-center max-w-sm shadow-2xl"
    >
      <div className="text-3xl font-extrabold mb-1">Game Over</div>
      <div className="text-slate-300 mb-4">Nice try! Can you beat your best?</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-3">
          <div className="text-xs uppercase text-slate-400">Score</div>
          <div className="text-2xl font-extrabold">{score}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-3">
          <div className="text-xs uppercase text-slate-400">Best</div>
          <div className="text-2xl font-extrabold">{best}</div>
        </div>
      </div>
    
      <button
        onClick={onRestart}
        className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-semibold shadow"
      >
        Restart
      </button>
    </motion.div>
  );
}

function PausedCard({ onResume, onRestart }:any) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="rounded-3xl bg-slate-900/80 backdrop-blur border border-white/10 p-6 text-center max-w-sm shadow-2xl"
    >
      <div className="text-3xl font-extrabold mb-1">Paused</div>
      <div className="text-slate-300 mb-5">Take a breather. You got this.</div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onResume}
          className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-semibold shadow"
        >
          Resume
        </button>
        <button
          onClick={onRestart}
          className="px-4 py-2 rounded-2xl bg-slate-700 hover:bg-slate-600 font-semibold shadow border border-white/10"
        >
          Restart
        </button>
      </div>
    </motion.div>
  );
}

function Target({ shape, size = 72 }:any) {
  const common = "relative shadow-lg hover:shadow-xl transition-shadow";
  const glow = "after:content-[''] after:absolute after:inset-0 after:rounded-full after:blur-xl after:opacity-60 after:bg-indigo-500/40";

  if (shape === "square") {
    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        className={`grid place-items-center ${common}`}
        style={{ width: size, height: size }}
      >
        <div className={`w-14 h-14 rounded-2xl bg-indigo-500 ${glow}`} />
      </motion.div>
    );
  }
  if (shape === "diamond") {
    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        className={`grid place-items-center ${common}`}
        style={{ width: size, height: size }}
      >
        <div className={`w-12 h-12 bg-indigo-500 rotate-45 rounded-md ${glow}`} />
      </motion.div>
    );
  }
  // circle (default)
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`grid place-items-center ${common}`}
      style={{ width: size, height: size }}
    >
      <div className={`w-14 h-14 rounded-full bg-indigo-500 ${glow}`} />
    </motion.div>
  );
}
