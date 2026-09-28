export type Archetype = "Builder" | "Collector" | "Flipper" | "HODLer";
export interface Bitmap { width: number; height: number; rows: string[]; }
export interface Strategy { id: string; name: string; description: string; target: number; }
export interface Metrics { kills: number; deaths: number; specials: number; frames: number; shotsFired: number; shotsHit: number; pickups: number; ammoPickedUp: number; ammoFromRespawns: number; accuracy: number | null; }
export interface RunEvent { type: string; text: string; stage: number; world: string; timeMs: number; ammoDelta?: number; livesDelta?: number; specialAmmoDelta?: number; pointsDelta?: number; pickup?: string; weapon?: string; }
export interface LevelResult extends Metrics { stage: number; world: string; strategy: string | null; objectiveTarget: number; objectiveMet: boolean; cleared: boolean; elapsedMs: number; ammoAtStart: number; ammoAtEnd: number; scoreEarned: number; objectivePoints: number; }
export interface RunReport { version: number; runId: string | null; savedAt: string; exportSource: "current" | "previous"; weapon: string; specialAmmo: number; bonus: {ammo: number; remainingMs: number} | null; campaign: string; hoodieId: string | null; archetype: string | null; phase: string; completed: boolean; score: number; ammo: number; lives: number; elapsedMs: number; levels: LevelResult[]; gallery: Metrics & {points: number}; events: RunEvent[]; }
export interface GameControls { move: (x: number, y: number) => void; select: (delta: number) => void; action: () => void; useSpecial: () => void; selectStrategy: (index: number) => void; launchLevel: () => void; exportRun: () => RunReport | null; exportPreviousRun: () => RunReport | null; }
export interface RunStats { exportAvailable: boolean; exportSource: "current" | "previous"; previousRunAvailable: boolean; level: number; world: string; levels: number; ammo: number; specialAmmo: number; weapon: string; lives: number; score: number; bonusSeconds: number; phase: "ready" | "briefing" | "playing" | "paused" | "bonus" | "ended"; strategies: Strategy[]; strategyIndex: number; strategy: string; objective: string; objectiveMet: boolean; objectiveProgress: number; objectiveTarget: number; objectiveStatus: "none" | "active" | "ready" | "complete" | "failed"; metrics: Metrics; event: RunEvent | null; lastReward: {world: string; ammo: number; clearAmmo: number; objectiveAmmo: number; points: number; objectiveMet: boolean} | null; }
export interface SpaceHoodElements { canvas: HTMLCanvasElement; startButton?: HTMLButtonElement; soundButton: HTMLButtonElement; pauseButton: HTMLButtonElement; status: HTMLParagraphElement; }
export interface SpaceHoodOptions {
  campaign?: "classic" | "hood";
  hoodieId?: string;
  archetype?: Archetype;
  hoodie?: Bitmap;
  residents?: Bitmap[];
  frames?: Bitmap[];
  authorizeStart?: () => Promise<boolean>;
  onSelect?: (delta: number) => void;
  onRunState?: (running: boolean) => void;
  onError?: (message: string) => void;
  onStats?: (stats: RunStats) => void;
  onControls?: (controls: GameControls) => void;
}
export declare function mountSpaceHood(elements: SpaceHoodElements, options?: SpaceHoodOptions): () => void;
