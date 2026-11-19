extends Node
## Autoload "Game": the player's progress and the story engine.

signal toast(text: String, kind: String)
signal changed
signal quest_event(ev: Dictionary)

const SAVE_PATH := "user://save.json"
const VERSION := 1
var s: Dictionary = new_game()

func new_game() -> Dictionary:
	return {
		"version": VERSION, "units": 300, "inv": {}, "upgrades": {},
		"suits": ["white"], "suit": "white", "paints": ["steel"], "paint": "steel",
		"rep": {"thalori": 0.0, "grumm": 0.0, "vesh": 0.0},
		"quest": {"q": 0, "s": 0, "n": 0}, "flags": {}, "bounty": null, "lore": [],
		"system": "0,0", "planet": 0, "docked": false, "in_space": false,
		"pos": null, "ship_pos": null, "mined": {},
		"stats": {"mined": 0, "kills": 0, "jumps": 0, "time": 0.0, "worlds": {}},
		"settings": {"quality": 2, "volume": 0.7, "music": true, "invert_y": false, "sens": 1.0, "fov": 75.0},
	}

# ---------------------------------------------------------------- inventory
func count(item: String) -> int: return int(s.inv.get(item, 0))
func cap(item: String) -> int: return 99 if Data.ITEMS[item].get("key", false) else 250 + 150 * level("cargo")
func level(id: String) -> int: return int(s.upgrades.get(id, 0))

func add_item(item: String, n: int) -> int:
	if not Data.ITEMS.has(item) or n <= 0: return 0
	var add: int = clampi(n, 0, cap(item) - count(item))
	if add > 0: s.inv[item] = count(item) + add; changed.emit()
	return add

func remove_item(item: String, n: int) -> bool:
	if count(item) < n: return false
	s.inv[item] = count(item) - n
	if s.inv[item] <= 0: s.inv.erase(item)
	changed.emit()
	return true

func can_afford(cost: Dictionary) -> bool:
	for k in cost: if count(k) < cost[k]: return false
	return true

func craft(id: String) -> String:
	var r: Dictionary = Data.RECIPES[id]
	if not can_afford(r.cost): return "Missing materials"
	if count(id) + r.out > cap(id): return "No room"
	for k in r.cost: remove_item(k, r.cost[k])
	add_item(id, r.out)
	return ""

# ---------------------------------------------------------------- trade
func buy_price(item: String, sys: Dictionary, with_rep := true) -> int:
	var rnd := RandomNumberGenerator.new(); rnd.seed = hash([sys.seed, item])
	var m := 0.75 + rnd.randf() * 0.6
	var f: String = sys.get("faction", "")
	if f != "":
		if Data.FACTIONS[f].good == item: m = 0.55
		if Data.FACTIONS[f].wants == item: m = 1.9
	var rep: float = s.rep.get(f, 0.0) if with_rep and f != "" else 0.0
	return maxi(1, roundi(Data.ITEMS[item].value * m * (1.0 - minf(0.15, rep * 0.01))))

func sell_price(item: String, sys: Dictionary) -> int:
	return maxi(1, roundi(buy_price(item, sys, false) * 0.8))

func stock_for(sys: Dictionary) -> Array:
	var st := ["ferrite", "carbon", "copper", "aetherium", "medgel", "warp_cell"]
	if sys.get("faction", "") != "": st.append(Data.FACTIONS[sys.faction].good)
	return st

func buy(item: String, n: int, sys: Dictionary) -> String:
	if Data.ITEMS[item].get("key", false) or not stock_for(sys).has(item): return "Not sold here"
	var cost := buy_price(item, sys) * n
	if s.units < cost: return "Not enough units"
	if count(item) + n > cap(item): return "No room"
	s.units -= cost; add_item(item, n)
	return ""

func sell(item: String, n: int, sys: Dictionary) -> String:
	if Data.ITEMS[item].get("key", false): return "Cannot sell that"
	n = mini(n, count(item))
	if n <= 0: return "Nothing to sell"
	var gain := sell_price(item, sys) * n
	remove_item(item, n); s.units += gain
	var f: String = sys.get("faction", "")
	if f != "": s.rep[f] = minf(100.0, s.rep[f] + gain / 2500.0)
	changed.emit()
	return ""

func buy_upgrade(id: String) -> String:
	var lv := level(id)
	if lv >= Data.UPGRADES[id].max: return "Fully upgraded"
	var cost := Data.upgrade_cost(id, lv)
	if s.units < cost: return "Not enough units"
	s.units -= cost; s.upgrades[id] = lv + 1; changed.emit()
	return ""

func buy_style(kind: String, id: String) -> String:
	var list: Array = Data.SUITS if kind == "suit" else Data.SHIP_PAINTS
	var owned: Array = s.suits if kind == "suit" else s.paints
	for c in list:
		if c.id != id: continue
		if not owned.has(id):
			if s.units < c.cost: return "Not enough units"
			s.units -= c.cost; owned.append(id)
		s[kind] = id; changed.emit()
		return ""
	return "Unknown style"

func style_color(kind: String) -> Color:
	for c in (Data.SUITS if kind == "suit" else Data.SHIP_PAINTS):
		if c.id == s[kind]: return c.color
	return Color.WHITE

# Numbers the simulation uses.
func mine_rate() -> float: return 16.0 * (1.0 + 0.45 * level("mining"))
func bolt_damage() -> float: return 18.0 * (1.0 + 0.4 * level("blaster"))
func jet_fuel() -> float: return 3.5 + 1.4 * level("jetpack")
func shield_max() -> float: return 60.0 + 30.0 * level("shield")
func hazard_time() -> float: return 180.0 + 90.0 * level("hazard")
func ship_hull() -> float: return 300.0 + 150.0 * level("hull")
func ship_damage() -> float: return 28.0 * (1.0 + 0.4 * level("cannon"))

# ---------------------------------------------------------------- story
func quest() -> Dictionary:
	return Data.QUESTS[s.quest.q] if s.quest.q < Data.QUESTS.size() else {}
func step() -> Dictionary:
	var q := quest()
	return q.steps[s.quest.s] if not q.is_empty() and s.quest.s < q.steps.size() else {}

func quest_text() -> Dictionary:
	var st := step()
	if st.is_empty(): return {"title": "Free flight", "text": "The galaxy is yours. Explore, trade, fight.", "hint": ""}
	var t: String = st.text
	if st.has("have"):
		for k in st.have: t += "  (%d/%d)" % [mini(count(k), st.have[k]), st.have[k]]
	if st.has("need"): t += "  (%d/%d)" % [s.quest.n, st.need]
	return {"title": quest().title, "text": t, "hint": st.get("hint", "")}

func _finish_step(st: Dictionary) -> void:
	for k in st.get("take", {}): remove_item(k, st.take[k])
	for k in st.get("give", {}): add_item(k, st.give[k])
	if st.has("flag"): s.flags[st.flag] = true
	s.units += int(st.get("units", 0))
	for f in st.get("rep", {}): s.rep[f] = minf(100.0, s.rep[f] + st.rep[f])
	quest_event.emit({"type": "step_done", "text": st.text, "units": st.get("units", 0), "give": st.get("give", {})})
	var q := quest()
	s.quest.s += 1; s.quest.n = 0
	if s.quest.s >= q.steps.size():
		s.quest.q += 1; s.quest.s = 0
		quest_event.emit({"type": "quest_done", "title": q.title})
		if not quest().is_empty(): quest_event.emit({"type": "quest_start", "title": quest().title})
	changed.emit()

## Feed a game event to the story. Returns "", "done", "lack" or "progress".
func story(type: String, data: Dictionary = {}) -> String:
	var st := step()
	if st.is_empty(): return ""
	if type == "tick":
		if st.has("have") and can_afford(st.have): _finish_step(st); return "done"
		return ""
	if st.get("on", "") != type: return ""
	for k in ["role", "what", "kind", "site"]:
		if st.has(k) and st[k] != data.get(k, ""): return ""
	if st.has("system") and data.has("system") and st.system != data.system: return ""
	if st.has("take") and not can_afford(st.take): return "lack"
	if st.has("need"):
		s.quest.n += 1
		if s.quest.n < st.need: changed.emit(); return "progress"
	_finish_step(st)
	return "done"

## What a named character says right now: {lines, story}.
func dialogue_for(role: String) -> Dictionary:
	var st := step()
	if st.get("on", "") == "talk" and st.get("role", "") == role:
		if st.has("take") and not can_afford(st.take): return {"lines": st.get("lack", ["Not yet."]), "story": false}
		return {"lines": st.get("say", ["..."]), "story": true}
	return {"lines": Data.IDLE_LINES.get(role, ["..."]), "story": false}

func new_bounty(rnd: RandomNumberGenerator, faction: String) -> Dictionary:
	if rnd.randf() < 0.55:
		var item: String = ["ferrite", "carbon", "copper", "aetherium"][rnd.randi() % 4]
		var n := 20 + (rnd.randi() % 5) * 10
		return {"kind": "bring", "item": item, "n": n, "faction": faction, "units": n * Data.ITEMS[item].value * 2 + 150, "text": "Bring %d %s" % [n, Data.ITEMS[item].name]}
	var n2 := 2 + rnd.randi() % 3
	return {"kind": "hunt", "n": n2, "done": 0, "faction": faction, "units": n2 * 260, "text": "Destroy %d sentinels" % n2}

func bounty_ready() -> bool:
	var b = s.bounty
	if b == null: return false
	return count(b.item) >= b.n if b.kind == "bring" else b.done >= b.n

func claim_bounty() -> bool:
	if not bounty_ready(): return false
	var b: Dictionary = s.bounty
	if b.kind == "bring": remove_item(b.item, b.n)
	s.units += b.units
	if s.rep.has(b.faction): s.rep[b.faction] = minf(100.0, s.rep[b.faction] + 4.0)
	s.bounty = null; changed.emit()
	return true

# ---------------------------------------------------------------- saving
func has_save() -> bool: return FileAccess.file_exists(SAVE_PATH)

func save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify(s))

func load_save() -> bool:
	if not has_save(): return false
	var js := JSON.new()
	if js.parse(FileAccess.get_file_as_string(SAVE_PATH)) != OK: return false
	var d = js.data
	if typeof(d) != TYPE_DICTIONARY or int(d.get("version", 0)) != VERSION: return false
	s = _merge(new_game(), d)
	s.units = maxi(0, int(s.units))
	for k in s.inv.keys():
		if not Data.ITEMS.has(k): s.inv.erase(k)
		else: s.inv[k] = clampi(int(s.inv[k]), 0, 5000)
	for k in s.upgrades.keys():
		if not Data.UPGRADES.has(k): s.upgrades.erase(k)
		else: s.upgrades[k] = clampi(int(s.upgrades[k]), 0, Data.UPGRADES[k].max)
	s.quest.q = clampi(int(s.quest.q), 0, Data.QUESTS.size()); s.quest.s = maxi(0, int(s.quest.s)); s.quest.n = maxi(0, int(s.quest.n))
	if not quest().is_empty() and s.quest.s >= quest().steps.size(): s.quest.s = 0
	s.planet = int(s.planet)
	s.settings.quality = clampi(int(s.settings.quality), 0, 3)
	if not str(s.system).contains(","): s.system = "0,0"
	return true

## Copy saved values over defaults, keeping only keys and types we expect.
func _merge(def: Dictionary, src: Dictionary) -> Dictionary:
	for k in def:
		if not src.has(k): continue
		var v = src[k]; var dv = def[k]
		if dv is Dictionary and v is Dictionary:
			def[k] = v if dv.is_empty() else _merge(dv, v)
		elif dv == null or typeof(dv) == typeof(v) or (dv is float and v is int) or (dv is int and v is float):
			def[k] = v
	return def

func wipe() -> void:
	if has_save(): DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
	s = new_game()
