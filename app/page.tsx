"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ROWS = 7;
const COLS = 7;
const ORDERS_TO_WIN = 4;
const MAX_GLOOM = 10;

const INGREDIENTS = {
  ember: { name: "烬椒", glyph: "炎", note: "躁烈" },
  tide: { name: "潮露", glyph: "汐", note: "流转" },
  sprout: { name: "青芽", glyph: "芽", note: "生长" },
  moon: { name: "月盐", glyph: "月", note: "沉静" },
  star: { name: "星砂", glyph: "星", note: "变幻" },
} as const;

type Kind = keyof typeof INGREDIENTS;
type Cell = { id: number; kind: Kind; blocked: boolean };
type Recipe = {
  name: string;
  guest: string;
  line: string;
  targets: Partial<Record<Kind, number>>;
  progress: Partial<Record<Kind, number>>;
};
type Mode = "transmute" | "strike" | null;
type Status = "playing" | "won" | "lost";
type EffectVariant = "clear" | "strike" | "transmute" | "purify" | "deny";
type BoardEffect = {
  id: number;
  index: number;
  kind: Kind;
  size: number;
  label: string;
  variant: EffectVariant;
};

const KINDS = Object.keys(INGREDIENTS) as Kind[];
const RECIPE_NAMES = [
  ["纸月狐", "一盏「不眠灯」", "今夜的路太长，借我一点亮。"],
  ["苔背龟", "一壶「慢春汤」", "别催，最好的春天总是来得慢。"],
  ["雨巷猫", "一碟「听雨糖」", "要能听见屋檐，也要尝得到风。"],
  ["巡夜鹤", "一瓶「破晓墨」", "天亮之前，替我写完最后一封信。"],
  ["灯笼鱼", "一包「浮光散」", "我把河底的星星弄丢了。"],
] as const;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function pickKind(random = Math.random): Kind {
  return KINDS[Math.floor(random() * KINDS.length)];
}

function buildBoard(seed = 83517): Cell[] {
  const random = seededRandom(seed);
  const cells: Cell[] = [];

  for (let index = 0; index < ROWS * COLS; index += 1) {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    const neighbors: Kind[] = [];
    if (col > 0) neighbors.push(cells[index - 1].kind);
    if (row > 0) neighbors.push(cells[index - COLS].kind);
    const kind = neighbors.length && random() < 0.24
      ? neighbors[Math.floor(random() * neighbors.length)]
      : pickKind(random);
    cells.push({ id: index + 1, kind, blocked: false });
  }
  return cells;
}

function makeRecipe(index: number): Recipe {
  const palette: [Kind, Kind][] = [
    ["star", "ember"],
    ["sprout", "tide"],
    ["tide", "moon"],
    ["ember", "moon"],
    ["star", "sprout"],
  ];
  const pair = palette[index % palette.length];
  const copy = RECIPE_NAMES[index % RECIPE_NAMES.length];
  return {
    guest: copy[0],
    name: copy[1],
    line: copy[2],
    targets: { [pair[0]]: 9 + (index % 3), [pair[1]]: 6 + (index % 2) },
    progress: { [pair[0]]: 0, [pair[1]]: 0 },
  };
}

function adjacent(index: number) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const result: number[] = [];
  if (row > 0) result.push(index - COLS);
  if (row < ROWS - 1) result.push(index + COLS);
  if (col > 0) result.push(index - 1);
  if (col < COLS - 1) result.push(index + 1);
  return result;
}

function connectedGroup(board: Cell[], start: number): number[] {
  if (board[start]?.blocked) return [];
  const kind = board[start]?.kind;
  const found = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    adjacent(current).forEach((next) => {
      if (!found.has(next) && !board[next].blocked && board[next].kind === kind) {
        found.add(next);
        queue.push(next);
      }
    });
  }
  return [...found];
}

function hasMove(board: Cell[]) {
  return board.some((cell, index) => !cell.blocked && adjacent(index).some(
    (next) => !board[next].blocked && board[next].kind === cell.kind,
  ));
}

function ensureMove(board: Cell[]) {
  if (hasMove(board)) return board;
  const next = board.map((cell) => ({ ...cell }));
  for (let index = 0; index < next.length; index += 1) {
    if (next[index].blocked) continue;
    const neighbor = adjacent(index).find((candidate) => !next[candidate].blocked);
    if (neighbor !== undefined) {
      next[neighbor].kind = next[index].kind;
      break;
    }
  }
  return next;
}

function collapseBoard(board: Cell[], removed: Set<number>, nextId: () => number) {
  const result = new Array<Cell>(ROWS * COLS);
  for (let col = 0; col < COLS; col += 1) {
    const survivors: Cell[] = [];
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const index = row * COLS + col;
      if (!removed.has(index)) survivors.push(board[index]);
    }
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      result[row * COLS + col] = survivors.shift() ?? {
        id: nextId(),
        kind: pickKind(),
        blocked: false,
      };
    }
  }
  return ensureMove(result);
}

function mostNeeded(recipe: Recipe): Kind {
  return (Object.keys(recipe.targets) as Kind[]).sort((a, b) => {
    const leftA = (recipe.targets[a] ?? 0) - (recipe.progress[a] ?? 0);
    const leftB = (recipe.targets[b] ?? 0) - (recipe.progress[b] ?? 0);
    return leftB - leftA;
  })[0];
}

export default function Home() {
  const [board, setBoard] = useState<Cell[]>(() => buildBoard());
  const [recipe, setRecipe] = useState<Recipe>(() => makeRecipe(0));
  const [moves, setMoves] = useState(20);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [mana, setMana] = useState(1);
  const [gloom, setGloom] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [streak, setStreak] = useState(1);
  const [bestStreak, setBestStreak] = useState(1);
  const [lastKind, setLastKind] = useState<Kind | null>(null);
  const [preview, setPreview] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [rewardPending, setRewardPending] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [boardEffect, setBoardEffect] = useState<BoardEffect | null>(null);
  const [message, setMessage] = useState("点击两个或更多相连的同类药材");
  const idRef = useRef(1000);
  const effectIdRef = useRef(0);
  const effectTimerRef = useRef<number | null>(null);

  const blockedCount = useMemo(() => board.filter((cell) => cell.blocked).length, [board]);
  const previewSet = useMemo(() => new Set(preview), [preview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = Number(window.localStorage.getItem("spirit-apothecary-high-score") ?? 0);
      setHighScore(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!rulesOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRulesOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [rulesOpen]);

  useEffect(() => () => {
    if (effectTimerRef.current) window.clearTimeout(effectTimerRef.current);
  }, []);

  function recordHighScore(finalScore: number) {
    if (finalScore <= highScore) return;
    setHighScore(finalScore);
    window.localStorage.setItem("spirit-apothecary-high-score", String(finalScore));
  }

  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  function triggerBoardEffect(effect: Omit<BoardEffect, "id">) {
    if (effectTimerRef.current) window.clearTimeout(effectTimerRef.current);
    effectIdRef.current += 1;
    setBoardEffect({ ...effect, id: effectIdRef.current });
    effectTimerRef.current = window.setTimeout(() => setBoardEffect(null), 720);
  }

  function addBlocker(nextBoard: Cell[]) {
    const candidates = nextBoard
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !cell.blocked);
    if (!candidates.length) return nextBoard;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)].index;
    return nextBoard.map((cell, index) => index === chosen ? { ...cell, blocked: true } : cell);
  }

  function finishHarvest(kinds: Kind[], clearedSize: number, primary: Kind | null, earnMana: boolean) {
    const nextMoves = moves - 1;
    const isAlternating = primary !== null && lastKind !== null && primary !== lastKind;
    const nextStreak = primary === null ? streak : isAlternating ? Math.min(5, streak + 1) : 1;
    const scoreGain = Math.round(clearedSize * clearedSize * 10 * (1 + (nextStreak - 1) * 0.18));
    const collected = kinds.reduce<Partial<Record<Kind, number>>>((acc, kind) => {
      acc[kind] = (acc[kind] ?? 0) + 1;
      return acc;
    }, {});
    const progress = { ...recipe.progress };
    (Object.keys(recipe.targets) as Kind[]).forEach((kind) => {
      progress[kind] = Math.min(
        recipe.targets[kind] ?? 0,
        (progress[kind] ?? 0) + (collected[kind] ?? 0),
      );
    });
    const recipeDone = (Object.keys(recipe.targets) as Kind[]).every(
      (kind) => (progress[kind] ?? 0) >= (recipe.targets[kind] ?? 0),
    );

    const usedInRecipe = (Object.keys(recipe.targets) as Kind[]).reduce((sum, kind) => {
      const remaining = Math.max(0, (recipe.targets[kind] ?? 0) - (recipe.progress[kind] ?? 0));
      return sum + Math.min(remaining, collected[kind] ?? 0);
    }, 0);
    const looseIngredients = Math.max(0, kinds.length - usedInRecipe);
    const manaGain = Math.min(4, Math.floor(looseIngredients / 2));
    const finalScore = score + scoreGain;

    setScore((current) => current + scoreGain);
    setMoves(nextMoves);
    if (earnMana && manaGain > 0) setMana((current) => Math.min(12, current + manaGain));
    if (primary) {
      setLastKind(primary);
      setStreak(nextStreak);
      setBestStreak((current) => Math.max(current, nextStreak));
    }

    const largeClear = clearedSize >= 5;
    const purifyingClear = clearedSize >= 7;
    const previousBand = Math.floor(gloom / 3);
    const nextGloom = Math.max(0, Math.min(MAX_GLOOM, gloom + (purifyingClear ? -1 : largeClear ? 0 : 1)));
    setGloom(nextGloom);
    setBoard((current) => {
      if (Math.floor(nextGloom / 3) > previousBand) return addBlocker(current);
      return current;
    });

    if (recipeDone) {
      const nextCompleted = completed + 1;
      setCompleted(nextCompleted);
      setRecipe(makeRecipe(nextCompleted));
      if (nextCompleted >= ORDERS_TO_WIN) {
        recordHighScore(finalScore);
        setStatus("won");
        setMessage("四张药方都已完成，百鬼夜市为你亮灯！");
      } else {
        setRewardPending(true);
        setMessage("药成！选一份客人的回礼，再接下一单");
      }
    } else {
      setRecipe((current) => ({ ...current, progress }));
      if (nextMoves <= 0 || nextGloom >= MAX_GLOOM) {
        recordHighScore(finalScore);
        setStatus("lost");
        setMessage(nextGloom >= MAX_GLOOM ? "晦气漫过了药柜" : "最后一炷香烧尽了");
      } else if (purifyingClear) {
        setMessage(`净炼 ${clearedSize} 枚，晦气退散，+${scoreGain} 分`);
      } else if (largeClear) {
        setMessage(`稳炼 ${clearedSize} 枚，压住晦气，+${scoreGain} 分`);
      } else if (isAlternating) {
        setMessage(`异色连择 ×${nextStreak}，+${scoreGain} 分`);
      } else {
        setMessage(`收下 ${clearedSize} 份${primary ? INGREDIENTS[primary].name : "药材"}`);
      }
    }
  }

  function clearCells(
    indices: number[],
    primary: Kind | null,
    earnMana = true,
    origin = indices[0],
    variant: EffectVariant = "clear",
  ) {
    const removed = new Set(indices);
    const kinds = indices.filter((index) => !board[index].blocked).map((index) => board[index].kind);
    const effectKind = primary ?? board[origin]?.kind ?? "star";
    const effectLabel = variant === "strike"
      ? "霆火！"
      : indices.length >= 7
        ? `${indices.length} 枚净炼！`
        : `${indices.length} 连`;
    triggerBoardEffect({ index: origin, kind: effectKind, size: indices.length, label: effectLabel, variant });
    const nextBoard = collapseBoard(board, removed, nextId);
    setBoard(nextBoard);
    setPreview([]);
    finishHarvest(kinds, indices.length, primary, earnMana);
  }

  function handleCell(index: number) {
    if (status !== "playing" || rewardPending) return;
    const cell = board[index];

    if (mode === "transmute") {
      if (cell.blocked) {
        setMessage("结晶中的药材无法引灵，换一枚试试");
        return;
      }
      const target = mostNeeded(recipe);
      const affected = [index, ...adjacent(index)].filter((candidate) => !board[candidate].blocked);
      setBoard((current) => current.map((item, cellIndex) =>
        affected.includes(cellIndex) ? { ...item, kind: target } : item,
      ));
      setMana((current) => current - 4);
      setMode(null);
      setPreview([]);
      triggerBoardEffect({
        index,
        kind: target,
        size: affected.length,
        label: `化 · ${INGREDIENTS[target].glyph}`,
        variant: "transmute",
      });
      setMessage(`五方引灵：附近药材已化作${INGREDIENTS[target].name}`);
      return;
    }

    if (mode === "strike") {
      const row = Math.floor(index / COLS);
      const col = index % COLS;
      const cross = board
        .map((_, cellIndex) => cellIndex)
        .filter((cellIndex) => Math.floor(cellIndex / COLS) === row || cellIndex % COLS === col);
      setMana((current) => current - 6);
      setMode(null);
      clearCells(cross, null, false, index, "strike");
      return;
    }

    if (cell.blocked) {
      setMessage("这枚药材已结晶，只能用霆火或净坛解开");
      return;
    }
    const group = connectedGroup(board, index);
    if (group.length < 2) {
      setPreview([index]);
      triggerBoardEffect({ index, kind: cell.kind, size: 1, label: "单枚不成组", variant: "deny" });
      setMessage("单独一枚无法入药，先想办法把同类聚起来");
      return;
    }
    clearCells(group, cell.kind, true, index, "clear");
  }

  function chooseSpell(spell: Exclude<Mode, null> | "purify") {
    if (status !== "playing" || rewardPending) return;
    if (spell === "transmute") {
      if (mana < 4) return setMessage("灵息还不够施展五方引灵");
      setMode(mode === "transmute" ? null : "transmute");
      setMessage(mode === "transmute" ? "已收起法术" : "选择一枚药材，将它和四周化为当前最缺的材料");
    }
    if (spell === "strike") {
      if (mana < 6) return setMessage("灵息还不够唤来十字霆火");
      setMode(mode === "strike" ? null : "strike");
      setMessage(mode === "strike" ? "已收起法术" : "选择落雷点：整行整列都会被采集");
    }
    if (spell === "purify") {
      if (mana < 5) return setMessage("灵息还不够清扫药坛");
      if (blockedCount === 0 && gloom === 0) return setMessage("药坛十分清净，先把灵息留着吧");
      setMana((current) => current - 5);
      setGloom((current) => Math.max(0, current - 4));
      setBoard((current) => current.map((item) => ({ ...item, blocked: false })));
      setMode(null);
      triggerBoardEffect({ index: 24, kind: "tide", size: blockedCount, label: "一息净坛", variant: "purify" });
      setMessage("净坛风扫过药柜，所有结晶已经松开");
    }
  }

  function chooseReward(reward: "time" | "cleanse" | "mana") {
    if (reward === "time") setMoves((current) => current + 4);
    if (reward === "cleanse") {
      setMoves((current) => current + 1);
      setGloom((current) => Math.max(0, current - 5));
      setBoard((current) => current.map((item) => ({ ...item, blocked: false })));
    }
    if (reward === "mana") {
      setMoves((current) => current + 1);
      setMana((current) => Math.min(12, current + 7));
    }
    setRewardPending(false);
    setBoardEffect(null);
    setMessage(`下一位客人是${makeRecipe(completed).guest}，看看药方需要什么`);
  }

  function restart() {
    const seed = Math.floor(Math.random() * 999999) + 1;
    setBoard(buildBoard(seed));
    setRecipe(makeRecipe(0));
    setMoves(20);
    setScore(0);
    setMana(1);
    setGloom(0);
    setCompleted(0);
    setStreak(1);
    setBestStreak(1);
    setLastKind(null);
    setPreview([]);
    setMode(null);
    setStatus("playing");
    setRewardPending(false);
    if (effectTimerRef.current) window.clearTimeout(effectTimerRef.current);
    setBoardEffect(null);
    setMessage("新火已燃，点击两个或更多相连的同类药材");
  }

  return (
    <main className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">不</span>
          <div>
            <p className="eyebrow">百鬼夜市 · 第七号摊</p>
            <h1>不息药铺</h1>
          </div>
        </div>
        <div className="scoreboard" aria-label="本局信息">
          <div><span>夜市声望</span><strong>{score.toLocaleString()}</strong></div>
          <i />
          <div><span>旧日最佳</span><strong>{highScore.toLocaleString()}</strong></div>
          <div className="top-actions">
            <button className="rules-top" type="button" onClick={() => setRulesOpen(true)}>玩法规则</button>
            <button className="restart-top" type="button" onClick={restart}>重开一局</button>
          </div>
        </div>
      </header>

      <section className="game-layout">
        <div className="board-column">
          <div className="goal-strip">
            <div className="turn-orb">
              <span>余火</span>
              <strong>{moves}</strong>
              <small>回合</small>
            </div>
            <div className="guest-copy">
              <span>客人 · {recipe.guest}</span>
              <h2>{recipe.name}</h2>
              <p>“{recipe.line}”</p>
            </div>
            <div className="order-progress">
              {(Object.keys(recipe.targets) as Kind[]).map((kind) => {
                const target = recipe.targets[kind] ?? 0;
                const current = recipe.progress[kind] ?? 0;
                return (
                  <div className={`mini-order kind-${kind}`} key={kind}>
                    <span className="mini-glyph">{INGREDIENTS[kind].glyph}</span>
                    <div>
                      <p>{INGREDIENTS[kind].name}</p>
                      <strong>{current}<em>/ {target}</em></strong>
                    </div>
                    <b style={{ "--fill": `${Math.min(100, current / target * 100)}%` } as React.CSSProperties} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`board-frame ${mode ? `mode-${mode}` : ""}`}>
            <div className="board-corners" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="board" role="grid" aria-label="七乘七药材棋盘" onPointerLeave={() => setPreview([])}>
              {board.map((cell, index) => {
                const groupSize = previewSet.has(index) ? preview.length : 0;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    aria-label={`${INGREDIENTS[cell.kind].name}${cell.blocked ? "，已结晶" : ""}${groupSize > 1 ? `，相连${groupSize}枚` : ""}`}
                    data-cell-index={index}
                    data-kind={cell.kind}
                    data-blocked={cell.blocked ? "true" : "false"}
                    data-group-size={groupSize > 1 ? groupSize : undefined}
                    className={`tile kind-${cell.kind} ${previewSet.has(index) ? "is-preview" : ""} ${cell.blocked ? "is-blocked" : ""}`}
                    key={cell.id}
                    onPointerEnter={() => {
                      if (!mode && !cell.blocked && status === "playing") setPreview(connectedGroup(board, index));
                    }}
                    onFocus={() => {
                      if (!mode && !cell.blocked && status === "playing") setPreview(connectedGroup(board, index));
                    }}
                    onClick={() => handleCell(index)}
                  >
                    <span className="tile-face">
                      <span className="tile-shine" />
                      <span className="tile-glyph">{INGREDIENTS[cell.kind].glyph}</span>
                      <small>{INGREDIENTS[cell.kind].note}</small>
                    </span>
                    {cell.blocked && <span className="crystal" aria-hidden="true">结</span>}
                  </button>
                );
              })}
              {boardEffect && (
                <div
                  className={`board-effect fx-${boardEffect.variant} kind-${boardEffect.kind}`}
                  key={boardEffect.id}
                  style={{
                    left: `${((boardEffect.index % COLS) + 0.5) / COLS * 100}%`,
                    top: `${(Math.floor(boardEffect.index / COLS) + 0.5) / ROWS * 100}%`,
                  }}
                  aria-hidden="true"
                >
                  <i className="effect-core" />
                  <b className="effect-ring" />
                  {Array.from({ length: Math.min(10, Math.max(6, boardEffect.size)) }).map((_, particle) => (
                    <span
                      className="effect-particle"
                      key={particle}
                      style={{
                        "--angle": `${particle * (360 / Math.min(10, Math.max(6, boardEffect.size)))}deg`,
                        "--distance": `${38 + (particle % 3) * 11}px`,
                      } as React.CSSProperties}
                    />
                  ))}
                  <strong>{boardEffect.label}</strong>
                </div>
              )}
            </div>
            <div className="board-message" aria-live="polite">
              <span className={mode ? "mode-dot active" : "mode-dot"} />
              {message}
            </div>
          </div>

          <div className="mobile-spells">
            <SpellButtons mana={mana} mode={mode} blockedCount={blockedCount} gloom={gloom} chooseSpell={chooseSpell} />
          </div>
        </div>

        <aside className="side-panel">
          <section className="night-card">
            <div className="section-heading">
              <div><span>今夜进度</span><strong>{completed} / {ORDERS_TO_WIN} 张药方</strong></div>
              <span className="chapter">戌时三刻</span>
            </div>
            <div className="lantern-track" aria-label={`已完成${completed}张，共${ORDERS_TO_WIN}张`}>
              {Array.from({ length: ORDERS_TO_WIN }).map((_, index) => (
                <span className={index < completed ? "lit" : index === completed ? "current" : ""} key={index}>
                  <i>{index < completed ? "成" : index + 1}</i>
                </span>
              ))}
            </div>
          </section>

          <section className="meter-card">
            <div className="section-heading">
              <div><span>药柜晦气</span><strong>{gloom} / {MAX_GLOOM}</strong></div>
              <span className={gloom >= 7 ? "danger-label" : "safe-label"}>{gloom >= 7 ? "危险" : gloom >= 4 ? "渐浓" : "安稳"}</span>
            </div>
            <div className="gloom-meter"><i style={{ width: `${gloom * 10}%` }} /></div>
            <p>普通小组会添一格晦气；5–6 枚可压住不增，7 枚以上才退一格。每跨过三格，会有药材结晶。</p>
          </section>

          <section className="combo-card">
            <div className="combo-seal"><span>连</span><strong>×{streak}</strong></div>
            <div>
              <span>异色连择</span>
              <p>连续选择不同药材，声望倍率会逐步升高。贪连择，还是赶药方？</p>
            </div>
          </section>

          <section className="spell-card">
            <div className="section-heading">
              <div><span>掌柜法术</span><strong>灵息 {mana} / 12</strong></div>
              <div className="mana-pips" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, index) => <i className={index * 2 < mana ? "full" : ""} key={index} />)}
              </div>
            </div>
            <SpellButtons mana={mana} mode={mode} blockedCount={blockedCount} gloom={gloom} chooseSpell={chooseSpell} />
          </section>

          <p className="strategy-note"><span>掌柜手记</span> 订单会收走需要的材料；每 2 份多余或不入方的材料可炼成 1 点灵息。要不要暂缓配药去攒法术，由你决定。</p>
        </aside>
      </section>

      {rewardPending && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reward-title">
          <div className="reward-dialog">
            <span className="dialog-kicker">一剂药成 · 客人回礼</span>
            <h2 id="reward-title">下一程，带走哪样？</h2>
            <p>这不是暂停，是一次构筑选择。</p>
            <div className="reward-grid">
              <button type="button" onClick={() => chooseReward("time")}>
                <span>刻</span><strong>借时纸钱</strong><small>余火 +4 回合</small>
              </button>
              <button type="button" onClick={() => chooseReward("cleanse")}>
                <span>净</span><strong>澄明露</strong><small>+1 回合，晦气 −5，解开结晶</small>
              </button>
              <button type="button" onClick={() => chooseReward("mana")}>
                <span>灵</span><strong>富灵种</strong><small>+1 回合，灵息 +7</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {status !== "playing" && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div className={`end-dialog ${status}`}>
            <div className="end-seal">{status === "won" ? "成" : "歇"}</div>
            <span className="dialog-kicker">{status === "won" ? "百鬼夜市 · 满灯" : "百鬼夜市 · 收摊"}</span>
            <h2 id="end-title">{status === "won" ? "不息药铺，今夜有名了" : "药火熄了，再燃一炉吧"}</h2>
            <p>{status === "won" ? `四位灵客都带着药离开。你的夜市声望是 ${score.toLocaleString()}。` : `你完成了 ${completed} 张药方，得到 ${score.toLocaleString()} 声望。下一局会是全新的药柜。`}</p>
            <div className="end-stats">
              <span><small>完成药方</small><strong>{completed} / {ORDERS_TO_WIN}</strong></span>
              <span><small>异色连择</small><strong>最高 ×{bestStreak}</strong></span>
              <span><small>旧日最佳</small><strong>{Math.max(highScore, score).toLocaleString()}</strong></span>
            </div>
            <button type="button" onClick={restart}>添一炉新火</button>
          </div>
        </div>
      )}

      {rulesOpen && (
        <div className="overlay rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
          <div className="rules-dialog">
            <button className="rules-close" type="button" aria-label="关闭玩法规则" onClick={() => setRulesOpen(false)}>×</button>
            <span className="dialog-kicker">掌柜入门 · 30 秒会玩</span>
            <h2 id="rules-title">今晚你只要做好一件事</h2>
            <p className="rules-lead">在回合或晦气耗尽前，完成 <strong>4 张药方</strong>。每张药方只收两种指定药材。</p>

            <div className="rules-steps">
              <section>
                <span className="rule-number">壹</span>
                <div><h3>找一团，点一下</h3><p>点击 <strong>上下左右相连</strong>的 2 枚以上同类药材。它们会被采集，上方药材落下并补充新药材。</p></div>
              </section>
              <section>
                <span className="rule-number">贰</span>
                <div><h3>先看本单要什么</h3><p>左上药方会写明需要的两种材料。需要的直接计入订单；每 <strong>2 份多余材料</strong>会炼成 1 点灵息。</p></div>
              </section>
              <section>
                <span className="rule-number">叁</span>
                <div><h3>别让晦气满格</h3><p>消除 2–4 枚会添 1 格晦气；5–6 枚不增；7 枚以上退 1 格。每跨过 3 格会结晶一枚，满 10 格立即失败。</p></div>
              </section>
            </div>

            <div className="rules-spells">
              <h3>灵息用来改变棋局</h3>
              <div>
                <span><b>引 · 4</b><small>十字五枚变成当前最缺材料<br />不耗回合，适合造大组</small></span>
                <span><b>霆 · 6</b><small>采集整行整列并打破结晶<br />消耗 1 回合，适合抢订单</small></span>
                <span><b>净 · 5</b><small>晦气 −4，解开全部结晶<br />不耗回合，适合救场</small></span>
              </div>
            </div>

            <div className="rules-tip">
              <span>第一步建议</span>
              <p>先找药方需要的<strong>大组</strong>；如果没有，就消一个较大的杂料组攒灵息。连续消不同颜色只提高分数，不影响通关。</p>
            </div>
            <button className="start-playing" type="button" onClick={() => setRulesOpen(false)}>懂了，开炉配药</button>
          </div>
        </div>
      )}
    </main>
  );
}

function SpellButtons({
  mana,
  mode,
  blockedCount,
  gloom,
  chooseSpell,
}: {
  mana: number;
  mode: Mode;
  blockedCount: number;
  gloom: number;
  chooseSpell: (spell: Exclude<Mode, null> | "purify") => void;
}) {
  return (
    <div className="spell-list">
      <button className={mode === "transmute" ? "selected" : ""} disabled={mana < 4} type="button" onClick={() => chooseSpell("transmute")}>
        <span className="spell-icon">引</span>
        <span><strong>五方引灵</strong><small>十字五枚 → 当前最缺材料 · 不耗回合</small></span>
        <em>4</em>
      </button>
      <button className={mode === "strike" ? "selected" : ""} disabled={mana < 6} type="button" onClick={() => chooseSpell("strike")}>
        <span className="spell-icon">霆</span>
        <span><strong>十字霆火</strong><small>采集整行整列，可破结晶 · 耗 1 回合</small></span>
        <em>6</em>
      </button>
      <button disabled={mana < 5 || (blockedCount === 0 && gloom === 0)} type="button" onClick={() => chooseSpell("purify")}>
        <span className="spell-icon">净</span>
        <span><strong>一息净坛</strong><small>晦气 −4，解开全部结晶 · 不耗回合</small></span>
        <em>5</em>
      </button>
    </div>
  );
}
