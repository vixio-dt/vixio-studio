import { createRng, hashStringToSeed, pickFrom } from "@/lib/random";
import { ok } from "@/lib/result";
import { sleep } from "@/lib/time";

import type {
  GeneratedScript,
  GeneratedShotList,
  ScriptRequest,
  TextProvider,
} from "../types";

/**
 * Offline screenplay writer. Fully deterministic: the same title and logline
 * always produce the same script, so regenerating without edits is stable.
 * The generator extracts content words from the logline and threads them
 * through bios, summaries, and dialogue so the output tracks the premise.
 */

type Rng = () => number;
type ScriptCharacter = GeneratedScript["characters"][number];
type ScriptScene = GeneratedScript["scenes"][number];
type ShotEntry = GeneratedShotList["shots"][number];
type Act = "setup" | "confrontation" | "resolution";

/* ------------------------------------------------------------------ */
/* Genre-aware content pools                                           */
/* ------------------------------------------------------------------ */

type CastSeed = { name: string; noun: "woman" | "man" };

type GenreProfile = {
  match: RegExp;
  cast: readonly CastSeed[];
  interiors: readonly string[];
  exteriors: readonly string[];
  wardrobe: readonly string[];
  props: readonly string[];
};

const w = (name: string): CastSeed => ({ name, noun: "woman" });
const m = (name: string): CastSeed => ({ name, noun: "man" });

const DEFAULT_PROFILE: GenreProfile = {
  match: /drama|romance|comedy|slice/i,
  cast: [w("Mara"), m("Theo"), w("Priya"), m("Daniel"), w("Nadia"), m("Sam")],
  interiors: [
    "a narrow apartment kitchen",
    "a framing shop after hours",
    "a hospital family room",
    "a community pool office",
  ],
  exteriors: [
    "a bus shelter on the ring road",
    "an allotment garden in light rain",
    "a ferry deck at the rail",
  ],
  wardrobe: [
    "a mustard corduroy jacket over a white tee",
    "a green wool sweater with a hospital lanyard",
    "a paint-flecked denim shirt with rolled sleeves",
    "a gray raincoat over supermarket work clothes",
  ],
  props: ["an unsent letter", "a spare house key", "a film camera", "a train ticket"],
};

const GENRE_PROFILES: readonly GenreProfile[] = [
  {
    match: /noir|crime|thriller|mystery|detective|heist/i,
    cast: [w("Vera"), m("Aldo"), w("Marisol"), m("Frank"), w("Odette"), m("Ray")],
    interiors: [
      "a basement records office",
      "an all-night diner",
      "a pawnshop back room",
      "a courthouse stairwell",
    ],
    exteriors: [
      "a rain-slicked loading dock",
      "a shuttered pier arcade",
      "an alley behind the transit depot",
    ],
    wardrobe: [
      "a charcoal trench coat over a wrinkled gray suit",
      "a rust-colored leather jacket and dark slacks",
      "a navy raincoat with the collar turned up, scuffed black oxfords",
      "a brown houndstooth blazer, loosened tie, worn brogues",
    ],
    props: ["a water-stained ledger", "a pawn ticket", "a brass key", "a cracked cassette tape"],
  },
  {
    match: /sci|space|future|station|colony|cyber|robot|android/i,
    cast: [w("Noor"), m("Casimir"), w("Ines"), m("Bram"), w("Suki"), m("Arlo")],
    interiors: [
      "a cargo bay lit by service strips",
      "a hydroponics deck",
      "a decommissioned control room",
      "a habitat module galley",
    ],
    exteriors: [
      "a landing field under two moons",
      "a dust flat beyond the colony fence",
      "a ridge along the solar array",
    ],
    wardrobe: [
      "a patched orange flight suit with mission tape on one sleeve",
      "a gray thermal layer under a utility harness",
      "a long insulated coat with sealed seams",
      "a technician's coverall, sleeves knotted at the waist",
    ],
    props: ["a cracked data slate", "a coolant valve", "a beacon core", "a sealed sample case"],
  },
  {
    match: /fantasy|myth|magic|kingdom|sword|quest|dragon/i,
    cast: [w("Brona"), m("Caldus"), w("Yseult"), m("Torvald"), w("Maren"), m("Edric")],
    interiors: [
      "a candlelit map room",
      "a granary loft",
      "a temple undercroft",
      "a ferry keeper's hut",
    ],
    exteriors: [
      "a stone bridge over a fast river",
      "a terraced orchard below the keep",
      "a salt road through the marsh",
    ],
    wardrobe: [
      "a wool traveling cloak pinned with a bone clasp",
      "a quilted leather jerkin over rough linen",
      "a gray habit with a rope belt and mud-stained hem",
      "a riding coat with horn buttons and a patched elbow",
    ],
    props: ["a wax-sealed letter", "a chipped signet ring", "an iron lantern", "a river chart"],
  },
  {
    match: /horror|ghost|haunt|monster|occult/i,
    cast: [w("Lena"), m("Hollis"), w("Petra"), m("Gideon"), w("June"), m("Marcus")],
    interiors: [
      "a farmhouse cellar",
      "a motel laundry room",
      "a church basement stacked with chairs",
      "an attic under bare rafters",
    ],
    exteriors: [
      "a tree line at the edge of a mowed field",
      "a gravel turnaround past the last streetlight",
      "a drained municipal pool",
    ],
    wardrobe: [
      "a flannel shirt over a thermal undershirt, mud-caked work boots",
      "a rain shell zipped to the chin, jeans gone through at one knee",
      "a cardigan over a nightdress, unlaced sneakers",
      "a county work jacket with a name patch picked half off",
    ],
    props: ["a hand-drawn map", "a jar of nails", "a child's shoe", "a tape recorder"],
  },
  {
    match: /western|frontier|outlaw|ranch|desert/i,
    cast: [w("Adeline"), m("Silas"), w("Rosa"), m("Eli"), w("Martha"), m("Boone")],
    interiors: [
      "a stagecoach office",
      "a dry goods store after closing",
      "a bunkhouse with one lit lamp",
      "a church with a swept dirt floor",
    ],
    exteriors: [
      "a switchback above the river crossing",
      "a fence line in open scrub",
      "a rail siding at the edge of town",
    ],
    wardrobe: [
      "a dust-colored duster over a collarless shirt",
      "a wool vest, a sweat-marked hat, leather gloves",
      "a riding skirt and a man's canvas coat",
      "a preacher's black coat gone brown at the cuffs",
    ],
    props: ["a folded deed", "a brand iron", "a canteen", "a tintype photograph"],
  },
  DEFAULT_PROFILE,
];

const profileFor = (genre: string): GenreProfile =>
  GENRE_PROFILES.find((profile) => profile.match.test(genre)) ?? DEFAULT_PROFILE;

const AGES = ["early 30s", "late 20s", "mid 40s", "late 50s", "early 60s"] as const;
const BUILDS = [
  "wiry frame",
  "broad shoulders",
  "slight build",
  "tall and angular",
  "compact and steady",
] as const;
const HAIR = [
  "cropped silver hair",
  "loose dark curls",
  "a tight gray braid",
  "short copper hair",
  "a clean-shaven head",
  "heavy black hair pinned up",
] as const;
const MARKS = [
  "a scar through one eyebrow",
  "deep-set tired eyes",
  "sun-lined cheeks",
  "wire-rim glasses",
  "a crooked once-broken nose",
  "faded forearm tattoos",
] as const;

/* ------------------------------------------------------------------ */
/* Writing templates ({A} {B} {motif} {location} {prop} tokens)        */
/* ------------------------------------------------------------------ */

const SUMMARIES: Record<Act, readonly string[]> = {
  setup: [
    "{A} finds the first sign of the {motif} at {location}.",
    "{A} brings {B} into the matter of the {motif}, and terms are set.",
    "A quiet meeting at {location} confirms the {motif} is real. Nobody says the word out loud.",
  ],
  confrontation: [
    "{A} presses {B} about the {motif}, and the alliance cracks.",
    "The plan goes wrong at {location}. The {motif} changes hands.",
    "{A} learns who else has been tracking the {motif}, and the room gets smaller.",
  ],
  resolution: [
    "{A} settles the question of the {motif} at {location}.",
    "What is left of the {motif} is laid to rest, at a price.",
    "{A} and {B} part ways with the {motif} finally answered between them.",
  ],
};

const DIALOGUE: Record<Act, readonly string[]> = {
  setup: [
    "I found the {motif} this morning. I have not told anyone else.",
    "Say it again, slower this time.",
    "You came all this way over a {motif}?",
    "Whatever this is, it started long before us.",
    "Keep it quiet until I know what we are holding.",
    "I need you to look at something tonight.",
  ],
  confrontation: [
    "You knew about the {motif} and you let me walk in blind.",
    "Lower your voice. They are closer than you think.",
    "We are past careful now. Past safe, too.",
    "Give me one reason to trust you after this.",
    "Then we do it my way, or not at all.",
    "If we stop now, the {motif} was for nothing.",
  ],
  resolution: [
    "It ends here. I am done running from the {motif}.",
    "Take it. I never wanted to carry it alone.",
    "Tomorrow we say nothing. We just live with it.",
    "You were right about the {motif}. I should have listened.",
    "Go home. I will finish this part myself.",
    "We made it count. That has to be enough.",
  ],
};

const OPEN_ACTIONS = [
  "{A} arrives first and checks the room before settling.",
  "{A} crosses to the window and watches the approach twice.",
  "Rain ticks against the glass while {A} lays out {prop}.",
  "{A} waits for the noise outside to pass before moving.",
  "{A} sets {prop} on the table and steps back from it.",
] as const;

const MID_ACTIONS = [
  "{A} turns {prop} over, reading the wear along its edge.",
  "A long pause. Neither of them reaches for {prop}.",
  "{A} counts steps along the wall and stops at the far corner.",
  "Somewhere below, a door closes. Everyone goes still.",
  "{A} pulls the light closer and studies {prop} again.",
] as const;

const CLOSE_ACTIONS = [
  "{A} pockets {prop} and pulls the door shut without a sound.",
  "The light gutters. {A} stays until it steadies.",
  "{A} leaves the way they came, slower this time.",
] as const;

const CLOSE_RESOLUTION = [
  "{A} leaves {prop} where it can finally be found.",
  "{A} stands at the threshold a moment, then walks out into the open.",
  "For the first time, {A} does not check the street before leaving.",
] as const;

type FillContext = { A: string; B: string; motif: string; location: string; prop: string };

const fill = (template: string, ctx: FillContext): string =>
  template
    .replaceAll("{A}", ctx.A)
    .replaceAll("{B}", ctx.B)
    .replaceAll("{motif}", ctx.motif)
    .replaceAll("{location}", ctx.location)
    .replaceAll("{prop}", ctx.prop);

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

/** Pulls a random item out of a mutable pool so picks never repeat. */
const takeFrom = <T>(pool: T[], rng: Rng): T => {
  const index = Math.floor(rng() * pool.length);
  const [item] = pool.splice(index, 1);
  if (item === undefined) throw new Error("takeFrom called with an empty pool");
  return item;
};

const STOPWORDS = new Set([
  "about", "after", "against", "another", "because", "become", "becomes",
  "been", "before", "being", "between", "both", "comes", "could", "decides",
  "discover", "discovers", "down", "during", "each", "every", "faces",
  "fight", "fights", "final", "finds", "first", "from", "gets", "goes",
  "have", "into", "just", "last", "learn", "learns", "leave", "leaves",
  "lose", "loses", "more", "most", "must", "only", "other", "over",
  "realizes", "returns", "same", "save", "saves", "should", "small", "some",
  "something", "struggles", "such", "take", "takes", "than", "that", "their",
  "them", "then", "there", "they", "this", "those", "through", "tries",
  "uncovers", "under", "until", "upon", "very", "wants", "what", "when",
  "where", "which", "while", "whose", "will", "with", "without", "would",
  "young", "your",
]);

const ARTICLES = new Set(["a", "an", "the", "his", "her", "their", "its"]);

const cleanWord = (word: string): string =>
  word.replace(/^['-]+|['-]+$/g, "").replace(/'s$/, "");

const isContentWord = (word: string): boolean =>
  word.length >= 4 && !word.endsWith("ly") && !word.endsWith("ed") && !STOPWORDS.has(word);

/**
 * Pulls 3 content words from the logline so the script tracks the premise.
 * Words right after an article are favored because they are almost always
 * nouns, which read naturally as "the {motif}" in summaries and dialogue.
 */
const extractMotifs = (logline: string): string[] => {
  const tokens = logline
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const motifs: string[] = [];
  const add = (word: string): void => {
    if (motifs.length < 3 && isContentWord(word) && !motifs.includes(word)) motifs.push(word);
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || !ARTICLES.has(token)) continue;
    for (let lookahead = 1; lookahead <= 2; lookahead++) {
      const next = tokens[index + lookahead];
      if (next === undefined) break;
      const clean = cleanWord(next);
      if (isContentWord(clean)) {
        add(clean);
        break;
      }
    }
  }
  for (const token of tokens) add(cleanWord(token));
  for (const fallback of ["promise", "debt", "letter"]) {
    if (motifs.length < 3 && !motifs.includes(fallback)) motifs.push(fallback);
  }
  return motifs;
};

const motifAt = (motifs: readonly string[], index: number): string =>
  motifs[index % motifs.length] ?? "letter";

const clampSceneCount = (value: number): number =>
  Number.isFinite(value) ? Math.min(10, Math.max(3, Math.round(value))) : 5;

/** Time of day arcs from day (sometimes dawn) into night across the script. */
const timeOfDayFor = (index: number, total: number, rng: Rng): ScriptScene["timeOfDay"] => {
  if (index === 0 && rng() < 0.3) return "dawn";
  const phase = total <= 1 ? 1 : index / (total - 1);
  if (phase <= 0.4) return "day";
  if (phase <= 0.65) return "dusk";
  return "night";
};

const locationPicker = (profile: GenreProfile, rng: Rng) => {
  let interiors = [...profile.interiors];
  let exteriors = [...profile.exteriors];
  return (): { setting: ScriptScene["setting"]; location: string } => {
    if (rng() < 0.45) {
      if (exteriors.length === 0) exteriors = [...profile.exteriors];
      return { setting: "exterior", location: takeFrom(exteriors, rng) };
    }
    if (interiors.length === 0) interiors = [...profile.interiors];
    return { setting: "interior", location: takeFrom(interiors, rng) };
  };
};

/* ------------------------------------------------------------------ */
/* Script assembly                                                     */
/* ------------------------------------------------------------------ */

const buildCast = (
  profile: GenreProfile,
  motifs: readonly string[],
  rng: Rng,
): { lead: ScriptCharacter; others: ScriptCharacter[] } => {
  const castPool = [...profile.cast];
  const ages = [...AGES];
  const builds = [...BUILDS];
  const hair = [...HAIR];
  const marks = [...MARKS];
  const wardrobePool = [...profile.wardrobe];

  const makeCharacter = (index: number): ScriptCharacter => {
    const seed = takeFrom(castPool, rng);
    const pronoun = seed.noun === "woman" ? "her" : "his";
    const subject = seed.noun === "woman" ? "she" : "he";
    const role: ScriptCharacter["role"] =
      index === 0
        ? "lead"
        : index === 1
          ? "supporting"
          : pickFrom(["supporting", "minor"] as const, rng);
    const bio =
      index === 0
        ? `${seed.name} has the most to lose if the truth about the ${motifAt(motifs, 0)} comes out.`
        : index === 1
          ? `${seed.name} knows more about the ${motifAt(motifs, 1)} than ${subject} admits.`
          : `${seed.name} watches from the edges and picks a side late.`;
    return {
      name: seed.name,
      role,
      bio,
      appearance: `a ${seed.noun} in ${pronoun} ${takeFrom(ages, rng)}, ${takeFrom(builds, rng)}, ${takeFrom(hair, rng)}, ${takeFrom(marks, rng)}`,
      wardrobe: takeFrom(wardrobePool, rng),
    };
  };

  const total = 2 + Math.floor(rng() * 3);
  const lead = makeCharacter(0);
  const others: ScriptCharacter[] = [];
  for (let index = 1; index < total; index++) others.push(makeCharacter(index));
  return { lead, others };
};

const buildBody = (
  act: Act,
  cast: readonly ScriptCharacter[],
  ctx: FillContext,
  rng: Rng,
): string => {
  const lines: string[] = [fill(pickFrom(OPEN_ACTIONS, rng), ctx)];
  const dialoguePool = [...DIALOGUE[act]];
  const exchangeCount =
    cast.length === 1 ? 1 : (act === "confrontation" ? 3 : 2) + Math.floor(rng() * 2);
  const spoken: string[] = [];
  for (let turn = 0; turn < exchangeCount; turn++) {
    const speaker = cast[turn % cast.length];
    if (speaker === undefined || dialoguePool.length === 0) break;
    spoken.push(`${speaker.name.toUpperCase()}: ${fill(takeFrom(dialoguePool, rng), ctx)}`);
  }
  const firstHalf = Math.ceil(spoken.length / 2);
  lines.push(...spoken.slice(0, firstHalf));
  lines.push(fill(pickFrom(MID_ACTIONS, rng), ctx));
  lines.push(...spoken.slice(firstHalf));
  lines.push(fill(pickFrom(act === "resolution" ? CLOSE_RESOLUTION : CLOSE_ACTIONS, rng), ctx));
  return lines.join("\n");
};

const buildScenes = (input: {
  profile: GenreProfile;
  motifs: readonly string[];
  lead: ScriptCharacter;
  others: readonly ScriptCharacter[];
  sceneCount: number;
  rng: Rng;
}): ScriptScene[] => {
  const { profile, motifs, lead, others, sceneCount, rng } = input;
  const nextLocation = locationPicker(profile, rng);
  const actOneEnd = Math.max(1, Math.round(sceneCount / 3));
  const actThreeStart = sceneCount - Math.max(1, Math.round(sceneCount / 4));
  const scenes: ScriptScene[] = [];

  for (let index = 0; index < sceneCount; index++) {
    const act: Act =
      index < actOneEnd ? "setup" : index < actThreeStart ? "confrontation" : "resolution";
    const { setting, location } = nextLocation();

    const cast: ScriptCharacter[] = [lead];
    for (const other of others) {
      if (cast.length >= 3) break;
      if (rng() < (other.role === "supporting" ? 0.6 : 0.35)) cast.push(other);
    }
    const firstOther = others[0];
    if (cast.length === 1 && firstOther !== undefined && rng() < 0.6) cast.push(firstOther);

    const ctx: FillContext = {
      A: cast[0]?.name ?? lead.name,
      B: cast[1]?.name ?? "",
      motif: motifAt(motifs, index),
      location,
      prop: pickFrom(profile.props, rng),
    };

    const summaryPool = SUMMARIES[act].filter(
      (template) => ctx.B.length > 0 || !template.includes("{B}"),
    );

    scenes.push({
      setting,
      location,
      timeOfDay: timeOfDayFor(index, sceneCount, rng),
      summary: fill(pickFrom(summaryPool, rng), ctx),
      body: buildBody(act, cast, ctx, rng),
      characterNames: cast.map((member) => member.name),
    });
  }
  return scenes;
};

const buildSynopsis = (
  request: ScriptRequest,
  lead: ScriptCharacter,
  motifs: readonly string[],
  scenes: readonly ScriptScene[],
): string => {
  const logline = request.logline.trim();
  const opening =
    logline.length === 0
      ? `A ${request.genre.trim().toLowerCase() || "drama"} about a ${motifAt(motifs, 0)} that will not stay quiet.`
      : /[.!?]$/.test(logline)
        ? logline
        : `${logline}.`;
  const first = scenes[0];
  const last = scenes[scenes.length - 1];
  const middle =
    first !== undefined && last !== undefined
      ? `${lead.name} follows the ${motifAt(motifs, 0)} from ${first.location} to ${last.location} and pays for what it uncovers.`
      : `${lead.name} follows the ${motifAt(motifs, 0)} further than anyone asked.`;
  return `${opening} ${middle} By the last night the ${motifAt(motifs, 1)} is settled, though not the way anyone planned.`;
};

/* ------------------------------------------------------------------ */
/* Shot list derivation                                                */
/* ------------------------------------------------------------------ */

type ParsedScene = { actions: string[]; dialogue: { speaker: string; line: string }[] };

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part.length === 0 ? part : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
    .join(" ");

/** Splits a scene body into action lines and "NAME: line" dialogue beats. */
const parseSceneBody = (body: string, knownNames: readonly string[]): ParsedScene => {
  const actions: string[] = [];
  const dialogue: ParsedScene["dialogue"] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || /^(INT|EXT)[.\s]/i.test(line)) continue;
    const match = /^([A-Za-z][A-Za-z .'-]{0,28}?)\s*:\s*(.+)$/.exec(line);
    if (match !== null) {
      const rawName = (match[1] ?? "").trim();
      const text = (match[2] ?? "").trim();
      if (rawName.length >= 2 && rawName.split(/\s+/).length <= 3 && text.length > 0) {
        const known = knownNames.find(
          (name) => name.trim().toLowerCase() === rawName.toLowerCase(),
        );
        dialogue.push({ speaker: known ?? toTitleCase(rawName), line: text });
        continue;
      }
    }
    actions.push(line);
  }
  return { actions, dialogue };
};

const firstSentence = (text: string): string => {
  const trimmed = text.trim();
  const match = /^[^.!?]*[.!?]/.exec(trimmed);
  const sentence = match?.[0]?.trim() ?? trimmed;
  return sentence.length > 0 ? sentence : "The scene settles into place.";
};

const PROP_WORDS = [
  "letter", "key", "map", "photograph", "photo", "ledger", "ticket", "knife",
  "phone", "lantern", "ring", "tape", "jar", "deed", "canteen", "slate",
  "valve", "case", "chart", "recorder", "camera", "coin", "watch", "badge",
] as const;

const findKeyObject = (text: string): string | null => {
  const lower = text.toLowerCase();
  for (const word of PROP_WORDS) {
    if (new RegExp(`\\b${word}s?\\b`).test(lower)) return word;
  }
  return null;
};

const COVERAGE_LINES = [
  "{S} speaks without looking up.",
  "{S} leans in and keeps the voice low.",
  "Reverse on {S} as the line lands.",
  "{S} watches the door while speaking.",
  "{S} holds still, measuring the reaction.",
] as const;

const MOTION_WORDS =
  /\b(runs?|running|walks?|walking|crosses|crossing|drives?|driving|chases?|chasing|climbs?|climbing|rides?|riding|follows?|following|sprints?)\b/i;
const TENSION_WORDS = /\b(no|never|stop|lie|lied|done|now|enough|blind|nothing|wrong)\b/i;

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export const previewTextProvider: TextProvider = {
  id: "vixio-preview",
  name: "Vixio preview writer",

  generateScript: async (request) => {
    const rng = createRng(hashStringToSeed(`${request.title}::${request.logline}`));
    await sleep(600 + Math.floor(rng() * 600));

    const profile = profileFor(request.genre);
    const motifs = extractMotifs(request.logline);
    const sceneCount = clampSceneCount(request.sceneCount);
    const { lead, others } = buildCast(profile, motifs, rng);
    const scenes = buildScenes({ profile, motifs, lead, others, sceneCount, rng });

    return ok({
      synopsis: buildSynopsis(request, lead, motifs, scenes),
      characters: [lead, ...others],
      scenes,
    });
  },

  generateShotList: async (input) => {
    const rng = createRng(hashStringToSeed(`${input.sceneSummary}::${input.sceneBody}`));
    await sleep(600 + Math.floor(rng() * 600));

    const parsed = parseSceneBody(input.sceneBody, input.characterNames);
    const moving = MOTION_WORDS.test(input.sceneBody) || MOTION_WORDS.test(input.sceneSummary);
    const shots: ShotEntry[] = [];

    // Coverage opens wide to set geography before cutting in.
    shots.push({
      description: `Establishing frame. ${parsed.actions[0] ?? firstSentence(input.sceneSummary)}`,
      dialogue: null,
      size: pickFrom(["wide", "extreme-wide"] as const, rng),
      angle: pickFrom(["eye-level", "high"] as const, rng),
      movement: moving ? "tracking" : pickFrom(["static", "push-in"] as const, rng),
      durationSeconds: 5 + Math.floor(rng() * 4),
      characterNames: input.characterNames.slice(0, 3),
    });

    // Mediums and close-ups alternate across the parsed dialogue beats.
    const sizesCycle = ["medium", "close-up", "over-the-shoulder", "close-up"] as const;
    for (const [index, entry] of parsed.dialogue.slice(0, 4).entries()) {
      if (shots.length >= 5) break;
      const size = sizesCycle[index % sizesCycle.length] ?? "medium";
      const partner =
        input.characterNames.find(
          (name) => name.toLowerCase() !== entry.speaker.toLowerCase(),
        ) ?? null;
      const tense = TENSION_WORDS.test(entry.line) || entry.line.includes("!");
      const words = entry.line.split(/\s+/).length;
      shots.push({
        description:
          size === "over-the-shoulder" && partner !== null
            ? `Over ${partner}'s shoulder onto ${entry.speaker}, holding both in frame.`
            : pickFrom(COVERAGE_LINES, rng).replaceAll("{S}", entry.speaker),
        dialogue: entry.line,
        size,
        angle: rng() < 0.2 ? pickFrom(["low", "high"] as const, rng) : "eye-level",
        movement: tense ? "push-in" : pickFrom(["static", "static", "handheld"] as const, rng),
        durationSeconds: Math.max(3, Math.min(8, Math.round(words / 2.5) + 2)),
        characterNames:
          size === "over-the-shoulder" && partner !== null
            ? [entry.speaker, partner]
            : [entry.speaker],
      });
    }

    // Silent scenes still get coverage built from the action lines.
    if (parsed.dialogue.length === 0) {
      for (const [index, size] of (["medium", "close-up"] as const).entries()) {
        shots.push({
          description:
            parsed.actions[index + 1] ?? parsed.actions[0] ?? firstSentence(input.sceneSummary),
          dialogue: null,
          size,
          angle: "eye-level",
          movement: moving
            ? index === 0
              ? "tracking"
              : "handheld"
            : index === 0
              ? "push-in"
              : "static",
          durationSeconds: 4 + Math.floor(rng() * 3),
          characterNames: input.characterNames.slice(0, 2),
        });
      }
    }

    // An insert on the key object slots in after the first cut-in.
    if (shots.length < 6) {
      const object = findKeyObject(`${input.sceneBody} ${input.sceneSummary}`);
      shots.splice(Math.min(2, shots.length), 0, {
        description:
          object !== null
            ? `Insert on the ${object}, filling the frame.`
            : "Insert on hands and the small object passing between them.",
        dialogue: null,
        size: "insert",
        angle: pickFrom(["high", "overhead"] as const, rng),
        movement: pickFrom(["static", "push-in"] as const, rng),
        durationSeconds: 3,
        characterNames: [],
      });
    }

    // Close on the person carrying the scene.
    if (shots.length < 6) {
      const primary = input.characterNames[0] ?? parsed.dialogue[0]?.speaker ?? null;
      shots.push({
        description:
          primary !== null
            ? `Hold on ${primary} as the moment settles.`
            : "Hold on the empty room as the moment settles.",
        dialogue: null,
        size: pickFrom(["close-up", "medium"] as const, rng),
        angle: "eye-level",
        movement: parsed.dialogue.length >= 2 ? "push-in" : "pull-out",
        durationSeconds: 4 + Math.floor(rng() * 3),
        characterNames: primary !== null ? [primary] : [],
      });
    }

    return ok({ shots: shots.slice(0, 6) });
  },
};
