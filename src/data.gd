class_name Data
## Static game data: items, recipes, upgrades, kingdoms, story.

const ITEMS := {
	"ferrite": {"name": "Ferrite", "value": 6, "color": Color(0.62, 0.64, 0.68), "desc": "Common metal from rocks."},
	"carbon": {"name": "Carbon", "value": 5, "color": Color(0.35, 0.7, 0.3), "desc": "Harvested from trees."},
	"copper": {"name": "Copper", "value": 22, "color": Color(0.95, 0.55, 0.3), "desc": "Conductive ore."},
	"gold": {"name": "Gold", "value": 90, "color": Color(1.0, 0.82, 0.3), "desc": "Rare and valuable."},
	"aetherium": {"name": "Aetherium", "value": 60, "color": Color(0.4, 0.95, 1.0), "desc": "Glowing crystal. Powers warp cells."},
	"warp_cell": {"name": "Warp Cell", "value": 420, "color": Color(0.7, 0.5, 1.0), "desc": "One jump between stars."},
	"medgel": {"name": "Med Gel", "value": 80, "color": Color(1.0, 0.4, 0.5), "desc": "Press H to restore health."},
	"silk": {"name": "Thalori Silk", "value": 140, "color": Color(0.6, 0.85, 1.0), "desc": "The Grumm pay well for it."},
	"ale": {"name": "Grumm Ale", "value": 140, "color": Color(0.9, 0.6, 0.25), "desc": "The Vesh pay well for it."},
	"incense": {"name": "Vesh Incense", "value": 140, "color": Color(0.75, 0.55, 0.95), "desc": "The Thalori pay well for it."},
	"shard_accord": {"name": "Shard of Accord", "value": 0, "color": Color(0.5, 0.85, 1.0), "desc": "One third of the key.", "key": true},
	"shard_valor": {"name": "Shard of Valor", "value": 0, "color": Color(1.0, 0.5, 0.3), "desc": "One third of the key.", "key": true},
	"shard_memory": {"name": "Shard of Memory", "value": 0, "color": Color(0.8, 0.55, 1.0), "desc": "One third of the key.", "key": true},
}
const RECIPES := {
	"warp_cell": {"cost": {"aetherium": 6, "copper": 8}, "out": 1},
	"medgel": {"cost": {"carbon": 18, "ferrite": 6}, "out": 1},
}
const FACTIONS := {
	"thalori": {"name": "Thalori Accord", "color": Color(0.45, 0.8, 1.0), "good": "silk", "wants": "incense"},
	"grumm": {"name": "Grumm Holds", "color": Color(1.0, 0.55, 0.3), "good": "ale", "wants": "silk"},
	"vesh": {"name": "Vesh Chorus", "color": Color(0.75, 0.55, 1.0), "good": "incense", "wants": "ale"},
}
const UPGRADES := {
	"mining": {"name": "Mining Beam", "desc": "Mine faster", "max": 4, "base": 400},
	"blaster": {"name": "Bolt Caster", "desc": "More weapon damage", "max": 4, "base": 500},
	"jetpack": {"name": "Jetpack", "desc": "Longer flight", "max": 3, "base": 450},
	"shield": {"name": "Suit Shield", "desc": "Absorb more damage", "max": 4, "base": 500},
	"hazard": {"name": "Hazard Protection", "desc": "Survive harsh worlds longer", "max": 3, "base": 450},
	"cargo": {"name": "Cargo Racks", "desc": "Carry more of each item", "max": 3, "base": 600},
	"hull": {"name": "Ship Hull", "desc": "Tougher ship", "max": 3, "base": 800},
	"cannon": {"name": "Ship Cannons", "desc": "More ship damage", "max": 3, "base": 800},
}
const SUITS := [
	{"id": "white", "name": "Factory White", "cost": 0, "color": Color(1, 1, 1)},
	{"id": "amber", "name": "Amber", "cost": 600, "color": Color(1.0, 0.72, 0.3)},
	{"id": "crimson", "name": "Crimson", "cost": 600, "color": Color(1.0, 0.35, 0.3)},
	{"id": "jade", "name": "Jade", "cost": 600, "color": Color(0.45, 1.0, 0.65)},
	{"id": "cobalt", "name": "Cobalt", "cost": 600, "color": Color(0.4, 0.6, 1.0)},
	{"id": "void", "name": "Void Black", "cost": 1500, "color": Color(0.22, 0.22, 0.26)},
]
const SHIP_PAINTS := [
	{"id": "steel", "name": "Bare Steel", "cost": 0, "color": Color(0.82, 0.84, 0.88)},
	{"id": "ember", "name": "Ember", "cost": 900, "color": Color(0.9, 0.3, 0.15)},
	{"id": "ocean", "name": "Ocean", "cost": 900, "color": Color(0.15, 0.4, 0.85)},
	{"id": "sun", "name": "Sunburst", "cost": 900, "color": Color(0.95, 0.72, 0.12)},
	{"id": "night", "name": "Midnight", "cost": 1800, "color": Color(0.08, 0.09, 0.14)},
]
const NPCS := {
	"elder": {"name": "Elder Maro", "title": "Lumen Hollow", "faction": "thalori"},
	"envoy": {"name": "Envoy Seren", "title": "Haven's Reach Station", "faction": "thalori"},
	"arbiter": {"name": "Arbiter Ilun", "title": "Spire of Accord", "faction": "thalori"},
	"warchief": {"name": "Warchief Brakka", "title": "Ironhold", "faction": "grumm"},
	"choir": {"name": "Choir-Mother Ysh", "title": "The Chorus", "faction": "vesh"},
}
const HOME := "0,0"
const KARG := "1,0"
const WHISPER := "0,1"
const SILENCE := "1,1"

const QUESTS := [
	{"id": "wake", "title": "Wreckage", "steps": [
		{"text": "Mine 30 Ferrite from boulders", "hint": "Aim at a large rock and hold the left mouse button", "have": {"ferrite": 30}},
		{"text": "Harvest 20 Carbon from trees", "hint": "Your mining beam cuts trees too", "have": {"carbon": 20}},
		{"text": "Repair your ship", "hint": "Walk to the ship and press E", "mark": "ship", "on": "interact", "what": "repair", "take": {"ferrite": 30, "carbon": 20}, "flag": "ship_repaired", "units": 200},
		{"text": "Find Lumen Hollow and speak with the Elder", "mark": "village", "on": "talk", "role": "elder", "units": 400, "rep": {"thalori": 5},
			"say": ["A sky-faller. We watched your fire come down in the night. I am Maro.", "You fell because the lanes are failing. Stars go quiet, one by one. We call it the Silence.", "I am too old to chase stars. The station above us still listens. Find Envoy Seren there. Take these units, and my blessing."]},
	]},
	{"id": "skyward", "title": "Skyward", "steps": [
		{"text": "Board your ship and climb to space", "hint": "E to board. W to lift off, Shift to boost, keep climbing", "mark": "ship", "on": "space"},
		{"text": "Dock at Haven's Reach Station", "hint": "Fly into the lit hangar bay", "mark": "station", "on": "dock"},
		{"text": "Speak with Envoy Seren", "mark": "station", "on": "talk", "role": "envoy", "units": 500,
			"say": ["So the Elder sent you. Good. Listen: the Silence is not weather. It is a door, left open.", "The Builders sealed it once with a key in three shards. One for each kingdom: the Thalori, the Grumm, the Vesh.", "Earn all three and the Ancient Gate will wake. Begin with ours. Arbiter Ilun holds court at the Spire of Accord, on the ocean world Thalora."]},
	]},
	{"id": "accord", "title": "The Shard of Accord", "steps": [
		{"text": "Land at the Spire of Accord on Thalora", "mark": "capital", "system": HOME, "planet": 1, "on": "arrive", "site": "capital"},
		{"text": "Speak with Arbiter Ilun", "mark": "capital", "system": HOME, "planet": 1, "on": "talk", "role": "arbiter",
			"say": ["A shard is not a gift. It is a debt. The Accord is built on fair exchange.", "Our foundries starve. Bring 25 Copper and 4 Gold, dug by your own hand or bought with your own coin, and the shard is yours."]},
		{"text": "Bring 25 Copper and 4 Gold to Arbiter Ilun", "hint": "Mine orange and gold deposits, or buy from traders", "mark": "capital", "system": HOME, "planet": 1, "on": "talk", "role": "arbiter", "take": {"copper": 25, "gold": 4},
			"lack": ["The scales are not yet balanced. 25 Copper. 4 Gold."], "give": {"shard_accord": 1, "warp_cell": 2}, "units": 800, "rep": {"thalori": 15},
			"say": ["Balanced. The Shard of Accord is yours. Carry it honestly.", "The Grumm will not trade for theirs. Warchief Brakka respects only deeds. Take these Warp Cells: Karg Forge lies one jump east."]},
	]},
	{"id": "valor", "title": "The Shard of Valor", "steps": [
		{"text": "Warp to Karg Forge", "hint": "In space, press M for the galaxy map", "on": "system", "system": KARG},
		{"text": "Land at Ironhold on Durn and find the Warchief", "mark": "capital", "system": KARG, "planet": 0, "on": "talk", "role": "warchief",
			"say": ["HA! A wanderer wants the Shard of Valor. Do you know what valor weighs?", "Rogue machines have dug into the dunes beyond our walls. They take our ore and our young. Break their den. Five of them. Then we talk."]},
		{"text": "Destroy the rogue machines at the Den", "hint": "Press Q to switch to your Bolt Caster", "mark": "outpost", "system": KARG, "planet": 0, "on": "kill", "kind": "rogue", "need": 5},
		{"text": "Return to Warchief Brakka", "mark": "capital", "system": KARG, "planet": 0, "on": "talk", "role": "warchief", "give": {"shard_valor": 1, "warp_cell": 2}, "units": 1200, "rep": {"grumm": 20},
			"say": ["The dunes are quiet. You fight like a Grumm.", "Take the shard. And take this: the Vesh sing to the dead in Whisperdeep. They will ask a stranger price than blood."]},
	]},
	{"id": "memory", "title": "The Shard of Memory", "steps": [
		{"text": "Warp to Whisperdeep", "on": "system", "system": WHISPER},
		{"text": "Land at The Chorus on Sszeth and speak with the Choir-Mother", "mark": "capital", "system": WHISPER, "planet": 0, "on": "talk", "role": "choir",
			"say": ["We heard you coming, three days ago. We remember forward, a little.", "Our shard is whole, but our memory is not. The Builders left an Echo Core in the Vault across the valley. Their sentinels still guard it.", "Bring the Core, and we will remember what the door is for."]},
		{"text": "Recover the Echo Core from the Vault of Echoes", "hint": "Sentinels guard the vault", "mark": "ruins", "system": WHISPER, "planet": 0, "on": "interact", "what": "relic", "flag": "echo_core"},
		{"text": "Return to Choir-Mother Ysh", "mark": "capital", "system": WHISPER, "planet": 0, "on": "talk", "role": "choir", "give": {"shard_memory": 1, "warp_cell": 2}, "units": 1500, "rep": {"vesh": 20},
			"say": ["Yes... we remember now. The Builders did not flee the Silence. They made it, to hide from something older.", "The Gate does not only close. It can open. Whoever holds three shards will choose. Take ours, and choose better than they did."]},
	]},
	{"id": "gate", "title": "Beyond the Silence", "steps": [
		{"text": "Warp to The Silence", "on": "system", "system": SILENCE},
		{"text": "Land at the Ancient Gate on Threshold", "mark": "gate", "system": SILENCE, "planet": 0, "on": "arrive", "site": "gate"},
		{"text": "Defeat the Warden of the Gate", "mark": "gate", "system": SILENCE, "planet": 0, "on": "kill", "kind": "warden", "need": 1},
		{"text": "Step up to the Gate and decide", "hint": "Press E at the Gate", "mark": "gate", "system": SILENCE, "planet": 0, "on": "interact", "what": "gate"},
	]},
]
const IDLE_LINES := {
	"elder": ["The hollow is safe while the lamps burn. Walk gently, sky-faller."],
	"envoy": ["Three shards. Three kingdoms. Do not keep the Gate waiting."],
	"arbiter": ["The Accord remembers its debts, and its friends."],
	"warchief": ["Come back when something needs breaking."],
	"choir": ["We will remember you. We already do."],
}
const LORE := {
	"thalori": ["A fair price is a kind of prayer.", "Before the Silence, a letter could cross the sky in a day. Now we shout into wells.", "The Grumm call us soft. They still buy our silk.", "The Builders left us the lanes. We forgot how to mend them.", "If you find Vesh incense, bring it here. Our scholars pay double."],
	"grumm": ["Good aim matters more than a heavy frame.", "Rogues are Grumm who forgot the clan. Do not pity them.", "We forged the hulls the Thalori sail in. Remember that.", "The sand keeps what the weak drop.", "Ale from the Holds fetches a fortune among the Vesh. They cannot brew."],
	"vesh": ["You will come back here. Twice.", "The sentinels are not cruel. They are loyal, to no one living.", "We do not sleep. We rehearse.", "The Silence has a shape. We have felt its edges.", "Thalori silk? We would trade much. It feels like quiet."],
}
const ENDINGS := {
	"seal": {"title": "THE LANES SING AGAIN", "text": "You set the three shards into the ring and the Gate folds shut like an eye. Across the galaxy, quiet stars begin to hum. The kingdoms will argue over who deserves the credit. You already have your reward: a working ship and an endless sky."},
	"open": {"title": "THE DOOR STANDS OPEN", "text": "You turn the shards the other way. The Silence does not end; it answers. Something vast and patient notices you, and it is not hostile. It is curious. The Builders hid for ten thousand years. You said hello."},
}

static func upgrade_cost(id: String, level: int) -> int:
	return int(UPGRADES[id].base * pow(1.9, level))
