// The story: "Beyond the Silence". A linear chain of quests, each a list of
// steps. A step completes on a game event (talk, dock, arrive, kill,
// interact...) or when a condition on the save becomes true.
import { FACTIONS } from '../universe/data.js';
import { addItem, canAfford, count, removeItem } from './state.js';

const HOME = '0,0';
const KARG = '1,0';
const WHISPER = '0,1';
const SILENCE = '1,1';

export const NPCS = {
  elder: { name: 'Elder Maro', title: 'Lumen Hollow', faction: 'thalori' },
  envoy: { name: 'Envoy Seren', title: "Haven's Reach Station", faction: 'thalori' },
  arbiter: { name: 'Arbiter Ilun', title: 'Spire of Accord', faction: 'thalori' },
  warchief: { name: 'Warchief Brakka', title: 'Ironhold', faction: 'grumm' },
  choir: { name: 'Choir-Mother Ysh', title: 'The Chorus', faction: 'vesh' },
};

export const QUESTS = [
  {
    id: 'wake', title: 'Wreckage',
    intro: 'IRIS: "Pilot, you are alive. The ship is not. Hull breach, launch fuel gone. Your multi-tool still works. Let us fix that."',
    steps: [
      { text: 'Mine 30 Ferrite from rocks', hint: 'Hold left mouse on grey rocks', check: (s) => count(s, 'ferrite') >= 30, show: ['ferrite', 30] },
      { text: 'Harvest 20 Carbon from plants', hint: 'Trees and bushes give carbon', check: (s) => count(s, 'carbon') >= 20, show: ['carbon', 20] },
      { text: 'Repair your ship', hint: 'Walk to the ship and press E', mark: { site: 'crash', system: HOME, planet: 0 }, on: 'interact', what: 'repair', take: { ferrite: 30, carbon: 20 }, flag: 'shipRepaired', reward: { units: 200 } },
      { text: 'Find the lights of Lumen Hollow and speak with the Elder', mark: { site: 'village', system: HOME, planet: 0 }, on: 'talk', role: 'elder',
        say: ['"A sky-faller! We saw your fire in the night. I am Maro."', '"You fell because the lanes are failing. Stars go quiet, one by one. We call it the Silence."', '"I am too old to chase stars. The station above us still listens. Find Envoy Seren. Take these units, and my blessing."'], reward: { units: 400, rep: { thalori: 5 } } },
    ],
  },
  {
    id: 'skyward', title: 'Skyward',
    steps: [
      { text: 'Board your ship (E) and fly to space', hint: 'W to take off, hold Shift to boost', mark: { site: 'crash', system: HOME, planet: 0 }, on: 'space' },
      { text: "Dock at Haven's Reach Station", hint: 'Fly into the glowing bay', mark: { station: true, system: HOME }, on: 'dock' },
      { text: 'Speak with Envoy Seren', mark: { station: true, system: HOME }, on: 'talk', role: 'envoy',
        say: ['"So the Elder sent you. Good. Listen: the Silence is not weather. It is a door, left open."', '"The Builders sealed it once with a key in three shards. One for each kingdom: the Thalori, the Grumm, the Vesh."', '"Earn all three and the Ancient Gate will wake. Begin with our own. Arbiter Ilun holds court at the Spire of Accord, on the ocean world Thalora."'], reward: { units: 500 } },
    ],
  },
  {
    id: 'accord', title: 'The Shard of Accord',
    steps: [
      { text: 'Land at the Spire of Accord on Thalora', mark: { site: 'capital', system: HOME, planet: 1 }, on: 'arrive', site: 'capital', system: HOME },
      { text: 'Speak with Arbiter Ilun', mark: { site: 'capital', system: HOME, planet: 1 }, on: 'talk', role: 'arbiter',
        say: ['"A shard is not a gift. It is a debt. The Accord is built on fair exchange."', '"Our foundries starve. Bring 25 Copper and 4 Gold, dug by your own hand or bought with your own coin, and the shard is yours."'] },
      { text: 'Bring 25 Copper and 4 Gold to Arbiter Ilun', hint: 'Mine teal and gold deposits, or buy at a station', mark: { site: 'capital', system: HOME, planet: 1 }, on: 'talk', role: 'arbiter', take: { copper: 25, gold: 4 },
        lack: ['"The scales are not yet balanced. 25 Copper. 4 Gold."'],
        say: ['"Balanced. The Shard of Accord is yours. Carry it honestly."', '"The Grumm will not trade for theirs. Warchief Brakka respects only deeds. Take these Warp Cells: Karg Forge lies one jump east."'], give: { shardCommerce: 1, warpCell: 2 }, reward: { units: 800, rep: { thalori: 15 } } },
    ],
  },
  {
    id: 'valor', title: 'The Shard of Valor',
    steps: [
      { text: 'Warp to Karg Forge', hint: 'In your ship in space, press M for the galaxy map', mark: { system: KARG }, on: 'system', system: KARG },
      { text: 'Land at Ironhold on Durn and find the Warchief', mark: { site: 'capital', system: KARG, planet: 0 }, on: 'talk', role: 'warchief',
        say: ['"HA! A soft-skin wants the Shard of Valor. Do you know what valor weighs?"', '"Raiders have dug into the dunes beyond our walls. They take our ore and our young. Break their den. Six heads. Then we talk."'] },
      { text: 'Destroy the Raider Den', hint: 'Press Q to switch to your Bolt Caster', mark: { site: 'outpost', system: KARG, planet: 0 }, on: 'kill', kind: 'raider', need: 6 },
      { text: 'Return to Warchief Brakka', mark: { site: 'capital', system: KARG, planet: 0 }, on: 'talk', role: 'warchief',
        say: ['"The dunes are quiet. You fight like a Grumm with a longer neck."', '"Take the shard. And take this: the Vesh sing to the dead in Whisperdeep. They will ask a stranger price than blood."'], give: { shardValor: 1, warpCell: 2 }, reward: { units: 1200, rep: { grumm: 20 } } },
    ],
  },
  {
    id: 'memory', title: 'The Shard of Memory',
    steps: [
      { text: 'Warp to Whisperdeep', mark: { system: WHISPER }, on: 'system', system: WHISPER },
      { text: 'Land at The Chorus on Sszeth and speak with the Choir-Mother', hint: 'The air is toxic. Sodium recharges hazard protection', mark: { site: 'capital', system: WHISPER, planet: 0 }, on: 'talk', role: 'choir',
        say: ['"We heard you coming, three days ago. We remember forward, a little."', '"Our shard is whole, but our memory is not. The Builders left an Echo Core in the Vault across the mire. Their sentinels still guard it."', '"Bring the Core, and we will remember what the door is for."'] },
      { text: 'Recover the Echo Core from the Vault of Echoes', hint: 'Sentinels guard the ruins', mark: { site: 'ruins', system: WHISPER, planet: 0 }, on: 'interact', what: 'relic', flag: 'echoCore' },
      { text: 'Return to Choir-Mother Ysh', mark: { site: 'capital', system: WHISPER, planet: 0 }, on: 'talk', role: 'choir',
        say: ['"Yes... we remember now. The Builders did not flee the Silence. They made it, to hide from something older."', '"The Gate does not only close. It can open. Whoever holds three shards will choose. Take ours, and choose better than they did."'], give: { shardMemory: 1, warpCell: 2 }, reward: { units: 1500, rep: { vesh: 20 } } },
    ],
  },
  {
    id: 'gate', title: 'Beyond the Silence',
    steps: [
      { text: 'Warp to The Silence', mark: { system: SILENCE }, on: 'system', system: SILENCE },
      { text: 'Land at the Ancient Gate on Threshold', mark: { site: 'gate', system: SILENCE, planet: 0 }, on: 'arrive', site: 'gate', system: SILENCE },
      { text: 'Defeat the Warden of the Gate', mark: { site: 'gate', system: SILENCE, planet: 0 }, on: 'kill', kind: 'warden', need: 1 },
      { text: 'Step up to the Gate and decide', hint: 'Press E at the Gate', mark: { site: 'gate', system: SILENCE, planet: 0 }, on: 'interact', what: 'gate' },
    ],
  },
];

export const ENDINGS = {
  seal: { title: 'THE LANES SING AGAIN', text: 'You set the three shards into the ring and the Gate folds shut like an eye. Across the galaxy, quiet stars begin to hum. The kingdoms will argue over who deserves the credit. You already have your reward: a working ship and an endless sky.' },
  open: { title: 'THE DOOR STANDS OPEN', text: 'You turn the shards the other way. The Silence does not end; it answers. Something vast and patient notices you, and it is not hostile. It is curious. The Builders hid for ten thousand years. You said hello.' },
};

export const currentQuest = (s) => QUESTS[s.quest.q] || null;
export const currentStep = (s) => currentQuest(s)?.steps[s.quest.s] || null;

function finishStep(s, step, out) {
  if (step.take) for (const k in step.take) removeItem(s, k, step.take[k]);
  if (step.give) for (const k in step.give) addItem(s, k, step.give[k]);
  if (step.flag) s.flags[step.flag] = true;
  if (step.reward) {
    if (step.reward.units) s.units += step.reward.units;
    if (step.reward.rep) for (const f in step.reward.rep) s.rep[f] = Math.min(100, (s.rep[f] || 0) + step.reward.rep[f]);
  }
  out.push({ type: 'stepDone', text: step.text, reward: step.reward, give: step.give });
  const q = QUESTS[s.quest.q];
  s.quest.s++;
  s.quest.n = 0;
  if (s.quest.s >= q.steps.length) {
    out.push({ type: 'questDone', title: q.title });
    s.quest.q++;
    s.quest.s = 0;
    const next = QUESTS[s.quest.q];
    if (next) out.push({ type: 'questStart', title: next.title, intro: next.intro });
  }
}

// Feed a game event into the story. Returns a list of things that happened.
export function storyEvent(s, type, data = {}) {
  const out = [];
  const step = currentStep(s);
  if (!step) return out;
  if (type === 'tick') {
    if (step.check && step.check(s)) finishStep(s, step, out);
    return out;
  }
  if (step.on !== type) return out;
  if (step.role && step.role !== data.role) return out;
  if (step.what && step.what !== data.what) return out;
  if (step.kind && step.kind !== data.kind) return out;
  if (step.site && step.site !== data.site) return out;
  if (step.system && data.system !== undefined && step.system !== data.system) return out;
  if (step.take && !canAfford(s, step.take)) {
    out.push({ type: 'lack', lines: step.lack || ['You do not have what is needed.'] });
    return out;
  }
  if (step.need) {
    s.quest.n++;
    if (s.quest.n < step.need) {
      out.push({ type: 'progress', n: s.quest.n, need: step.need });
      return out;
    }
  }
  finishStep(s, step, out);
  return out;
}

// What a named character says right now.
export function dialogueFor(s, role) {
  const step = currentStep(s);
  const npc = NPCS[role];
  if (step && step.on === 'talk' && step.role === role) {
    if (step.take && !canAfford(s, step.take)) return { npc, lines: step.lack || ['"Not yet."'], story: false };
    return { npc, lines: step.say || ['"..."'], story: true };
  }
  const idle = {
    elder: ['"The hollow is safe while the lamps burn. Walk gently, sky-faller."'],
    envoy: ['"Three shards. Three kingdoms. Do not keep the Gate waiting."'],
    arbiter: ['"The Accord remembers its debts, and its friends."'],
    warchief: ['"Come back when something needs breaking."'],
    choir: ['"We will remember you. We already do."'],
  };
  return { npc, lines: idle[role] || ['"..."'], story: false };
}

// Flavour lines for ordinary villagers, by kingdom.
export const LORE = {
  thalori: ['"A fair price is a kind of prayer."', '"Before the Silence, a letter could cross the sky in a day. Now we shout into wells."', '"The Grumm call us soft. They still buy our silk."', '"The Builders left us the lanes. We forgot how to mend them."', '"If you find Vesh incense, bring it here. Our scholars pay double."'],
  grumm: ['"You have small arms. Good aim makes up for it."', '"Raiders are Grumm who forgot the clan. Do not pity them."', '"We forged the hulls the Thalori sail in. Remember that."', '"The sand keeps what the weak drop."', '"Ale from the Holds fetches a fortune among the Vesh. They cannot brew."'],
  vesh: ['"You will come back here. Twice."', '"The sentinels are not cruel. They are loyal, to no one living."', '"We do not sleep. We rehearse."', '"The Silence has a shape. We have felt its edges."', '"Thalori silk? We would trade much. It feels like quiet."'],
};

export function randomBounty(rnd, faction) {
  const items = ['ferrite', 'carbon', 'copper', 'sodium', 'oxygen'];
  if (rnd() < 0.55) {
    const item = items[Math.floor(rnd() * items.length)];
    const n = 20 + Math.floor(rnd() * 5) * 10;
    return { kind: 'bring', item, n, faction, units: n * 14, text: `Bring ${n} ${item}` };
  }
  const n = 3 + Math.floor(rnd() * 4);
  return { kind: 'hunt', n, done: 0, faction, units: n * 160, text: `Destroy ${n} sentinels or predators` };
}

export function bountyReady(s) {
  const b = s.bounty;
  if (!b) return false;
  return b.kind === 'bring' ? count(s, b.item) >= b.n : b.done >= b.n;
}

export function claimBounty(s) {
  const b = s.bounty;
  if (!b || !bountyReady(s)) return null;
  if (b.kind === 'bring') removeItem(s, b.item, b.n);
  s.units += b.units;
  if (b.faction && FACTIONS[b.faction]) s.rep[b.faction] = Math.min(100, (s.rep[b.faction] || 0) + 4);
  s.bounty = null;
  return b;
}
