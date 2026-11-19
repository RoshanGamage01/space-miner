class_name Universe
## The galaxy: an endless grid of star systems generated from coordinates,
## with four authored systems for the story.

const STARS := [
	{"name": "Yellow dwarf", "color": Color(1.0, 0.95, 0.82)}, {"name": "Orange dwarf", "color": Color(1.0, 0.78, 0.55)},
	{"name": "Red dwarf", "color": Color(1.0, 0.55, 0.4)}, {"name": "Blue giant", "color": Color(0.72, 0.84, 1.0)}, {"name": "White star", "color": Color(0.95, 0.97, 1.0)},
]
const STORY := {
	"0,0": {"name": "Haven's Reach", "star": 0, "faction": "thalori", "planets": [
		{"name": "Verdis", "type": "lush", "sites": [{"type": "crash"}, {"type": "village", "faction": "thalori", "name": "Lumen Hollow", "npc": "elder"}, {"type": "ruins", "name": "Old Stones"}]},
		{"name": "Thalora", "type": "lush", "sea_bias": 26.0, "sites": [{"type": "capital", "faction": "thalori", "name": "Spire of Accord", "npc": "arbiter"}, {"type": "village", "faction": "thalori", "name": "Tidewatch"}]},
		{"name": "Cinder", "type": "barren", "sites": [{"type": "outpost", "name": "Derelict Camp"}]}]},
	"1,0": {"name": "Karg Forge", "star": 2, "faction": "grumm", "planets": [
		{"name": "Durn", "type": "desert", "sites": [{"type": "capital", "faction": "grumm", "name": "Ironhold", "npc": "warchief"}, {"type": "outpost", "name": "Rogue Den"}, {"type": "village", "faction": "grumm", "name": "Anvil Rest"}]},
		{"name": "Ashfall", "type": "volcanic", "sites": [{"type": "village", "faction": "grumm", "name": "Slagmouth"}, {"type": "outpost", "name": "Scrap Pit"}]}]},
	"0,1": {"name": "Whisperdeep", "star": 3, "faction": "vesh", "planets": [
		{"name": "Sszeth", "type": "exotic", "sites": [{"type": "capital", "faction": "vesh", "name": "The Chorus", "npc": "choir"}, {"type": "ruins", "name": "Vault of Echoes", "relic": true}, {"type": "village", "faction": "vesh", "name": "Murmur"}]},
		{"name": "Rime", "type": "frozen", "sites": [{"type": "village", "faction": "vesh", "name": "Stillwater"}]}]},
	"1,1": {"name": "The Silence", "star": 4, "faction": "", "planets": [
		{"name": "Threshold", "type": "exotic", "sites": [{"type": "gate", "name": "The Ancient Gate"}]},
		{"name": "Hollow", "type": "barren", "sites": []}]},
}
const SYL := ["ka", "ri", "zo", "ven", "tal", "mor", "esh", "ul", "dra", "ny", "sol", "ith", "ar", "qua", "bel", "ox", "um", "lyr", "tor", "sa", "ne", "vi", "gar", "phe"]
const TYPES := ["lush", "desert", "frozen", "volcanic", "barren", "exotic"]

static var _cache := {}

static func make_name(rnd: RandomNumberGenerator) -> String:
	var n := ""
	for i in rnd.randi_range(2, 3): n += SYL[rnd.randi() % SYL.size()]
	return n.capitalize()

static func parse(id: String) -> Vector2i:
	var p := id.split(",")
	return Vector2i(int(p[0]), int(p[1]))

## Cheap info for the galaxy map.
static func star(gx: int, gy: int) -> Dictionary:
	var id := "%d,%d" % [gx, gy]
	var rnd := RandomNumberGenerator.new(); rnd.seed = hash(["sys", gx, gy])
	var st: Dictionary = STORY.get(id, {})
	var fr := RandomNumberGenerator.new(); fr.seed = hash(["fac", floori(gx / 3.0), floori(gy / 3.0)])
	var fac: String = ["thalori", "grumm", "vesh"][fr.randi() % 3]
	return {
		"id": id, "gx": gx, "gy": gy, "seed": hash(["seed", gx, gy]),
		"name": st.get("name", make_name(rnd)),
		"star": STARS[st.get("star", rnd.randi() % STARS.size())],
		"faction": st.get("faction", fac if rnd.randf() < 0.8 else ""),
		"story": not st.is_empty(),
		"off": Vector2.ZERO if not st.is_empty() else Vector2(rnd.randf() - 0.5, rnd.randf() - 0.5) * 0.7,
	}

static func system(id: String) -> Dictionary:
	if _cache.has(id): return _cache[id]
	var g := parse(id)
	var sys := star(g.x, g.y)
	var rnd := RandomNumberGenerator.new(); rnd.seed = hash(["gen", g.x, g.y])
	var st: Dictionary = STORY.get(id, {})
	var n: int = st.planets.size() if not st.is_empty() else rnd.randi_range(2, 5)
	sys.planets = []
	for i in n:
		var a: Dictionary = st.planets[i] if not st.is_empty() else {}
		var type: String = a.get("type", TYPES[rnd.randi() % TYPES.size()])
		var sites: Array = a.get("sites", []).duplicate(true)
		if a.is_empty():
			var airless: bool = Biomes.TYPES[type].get("airless", false)
			for v in rnd.randi_range(0 if airless else 1, 2): sites.append({"type": "village", "faction": sys.faction if sys.faction != "" else ["thalori", "grumm", "vesh"][rnd.randi() % 3]})
			if rnd.randf() < 0.6: sites.append({"type": "ruins", "relic": rnd.randf() < 0.5})
			if rnd.randf() < 0.5: sites.append({"type": "outpost"})
		for sidx in sites.size():
			if not sites[sidx].has("name"): sites[sidx].name = make_name(rnd) + [" Hollow", " Rest", " Reach", " Watch"][rnd.randi() % 4] if sites[sidx].type == "village" else {"ruins": "Builder Ruins", "outpost": "Rogue Camp", "crash": "Crash Site"}.get(sites[sidx].type, "Site")
		var ang := rnd.randf() * TAU; var orbit := 9000.0 + i * 7500.0 + rnd.randf_range(-1200, 1200)
		sys.planets.append({
			"index": i, "name": a.get("name", make_name(rnd) + (" " + ["II", "III", "IV", "Prime"][rnd.randi() % 4] if rnd.randf() < 0.3 else "")),
			"type": type, "seed": hash(["planet", sys.seed, i]) & 0x7fffffff, "sea_bias": a.get("sea_bias", 0.0),
			"radius": rnd.randf_range(900.0, 1500.0), "pos": Vector3(cos(ang) * orbit, rnd.randf_range(-500, 500), sin(ang) * orbit),
			"gravity": rnd.randf_range(8.5, 11.5), "tod": rnd.randf_range(0.3, 0.42), "sites": sites, "system": id,
		})
	var p0: Dictionary = sys.planets[0]
	sys.station = {"pos": p0.pos + p0.pos.normalized() * -(p0.radius + 1500.0) + Vector3(0, 500, 0), "name": sys.name + " Station"}
	if _cache.size() > 60: _cache.clear()
	_cache[id] = sys
	return sys
