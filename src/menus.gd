class_name Menus extends CanvasLayer
## Every full-screen panel: title, dialogue, shop, inventory, journal,
## galaxy map, pause and endings. The game is paused while one is open.

var main
var open := ""
var root := Control.new()
var panel: Control
var on_close: Callable
var dlg := {}
var shop_tab := "trade"
var sel_star := ""
var map_center := Vector2.ZERO
const BG := Color(0.035, 0.05, 0.075, 0.9)

func _init(m) -> void:
	main = m; layer = 10; process_mode = Node.PROCESS_MODE_ALWAYS
	root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(root)

# ---------------------------------------------------------------- helpers
func _lab(text: String, size := 16, color := Color.WHITE, bold := false) -> Label:
	var l := Label.new(); l.text = text
	l.add_theme_font_override("font", main.hud.font_b if bold else main.hud.font); l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l

func _btn(text: String, cb: Callable, primary := false, enabled := true) -> Button:
	var b := Button.new(); b.text = text; b.disabled = not enabled; b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", main.hud.font_b); b.add_theme_font_size_override("font_size", 15)
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxFlat.new(); sb.set_corner_radius_all(7); sb.content_margin_left = 16; sb.content_margin_right = 16; sb.content_margin_top = 8; sb.content_margin_bottom = 8
		var base := Color(1.0, 0.72, 0.28) if primary else Color(1, 1, 1, 0.1)
		if st == "hover": base = base.lightened(0.18) if primary else Color(1, 1, 1, 0.2)
		if st == "pressed": base = base.darkened(0.15) if primary else Color(1, 1, 1, 0.28)
		if st == "disabled": base = Color(1, 1, 1, 0.04)
		sb.bg_color = base; b.add_theme_stylebox_override(st, sb)
	b.add_theme_color_override("font_color", Color(0.08, 0.06, 0.02) if primary else Color.WHITE)
	b.add_theme_color_override("font_hover_color", Color(0.08, 0.06, 0.02) if primary else Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.3))
	b.pressed.connect(func(): main.sfx("click", -8.0); cb.call())
	return b

func _show(name: String, size: Vector2, title := "", align_bottom := false) -> VBoxContainer:
	_clear()
	open = name
	get_tree().paused = true
	main.capture(false)
	var dim := ColorRect.new(); dim.color = Color(0, 0, 0, 0.0 if align_bottom else 0.45); dim.set_anchors_preset(Control.PRESET_FULL_RECT); root.add_child(dim)
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new(); sb.bg_color = BG; sb.set_corner_radius_all(14); sb.set_content_margin_all(26)
	sb.border_color = Color(1, 1, 1, 0.09); sb.set_border_width_all(1); sb.shadow_color = Color(0, 0, 0, 0.5); sb.shadow_size = 30
	pc.add_theme_stylebox_override("panel", sb)
	pc.custom_minimum_size = size
	pc.set_anchors_preset(Control.PRESET_CENTER_BOTTOM if align_bottom else Control.PRESET_CENTER)
	pc.grow_horizontal = Control.GROW_DIRECTION_BOTH; pc.grow_vertical = Control.GROW_DIRECTION_BEGIN if align_bottom else Control.GROW_DIRECTION_BOTH
	if align_bottom: pc.position.y -= 70
	root.add_child(pc); panel = pc
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 12); pc.add_child(v)
	if title != "":
		var h := HBoxContainer.new(); v.add_child(h)
		h.add_child(_lab(title, 26, Color.WHITE, true))
		var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(sp)
		h.add_child(_lab("%s units" % main.hud._fmt(Game.s.units), 18, Hud.AMBER, true))
		var x := _btn("✕", close); h.add_child(x)
	return v

func _clear() -> void:
	for c in root.get_children(): c.queue_free()
	panel = null

func close() -> void:
	if open == "" or open == "title" or open == "choice": return
	_clear(); open = ""
	get_tree().paused = false
	main.capture(true)
	if on_close.is_valid():
		var cb := on_close; on_close = Callable(); cb.call()

func _unhandled_key_input(e: InputEvent) -> void:
	if open == "" or not e.pressed or e.echo: return
	var k: int = e.physical_keycode
	if open == "dialogue" and (k == KEY_E or k == KEY_SPACE or k == KEY_ENTER): _dlg_next(); get_viewport().set_input_as_handled()
	elif k == KEY_ESCAPE or (k == KEY_TAB and open == "inventory") or (k == KEY_J and open == "journal") or (k == KEY_M and open == "galaxy"):
		close(); get_viewport().set_input_as_handled()

# ---------------------------------------------------------------- title
func title() -> void:
	_clear(); open = "title"; get_tree().paused = true; main.capture(false)
	if main.world is SurfaceWorld: main.world.player.tool_node.visible = false
	var grad := ColorRect.new(); grad.set_anchors_preset(Control.PRESET_FULL_RECT)
	var sh := Shader.new(); sh.code = "shader_type canvas_item; void fragment(){ COLOR = vec4(0.01, 0.02, 0.04, mix(0.15, 0.82, smoothstep(0.75, 0.1, UV.x)) ); }"
	var sm := ShaderMaterial.new(); sm.shader = sh; grad.material = sm; root.add_child(grad)
	var v := VBoxContainer.new(); v.set_anchors_preset(Control.PRESET_CENTER_LEFT); v.position = Vector2(130, -230); v.add_theme_constant_override("separation", 10); root.add_child(v)
	var t := _lab("SPACE MINER", 92, Color.WHITE, true); v.add_child(t)
	var st := _lab("B E Y O N D   T H E   S I L E N C E", 22, Hud.AMBER, true); v.add_child(st)
	var gap := Control.new(); gap.custom_minimum_size.y = 40; v.add_child(gap)
	var has := Game.has_save()
	var col := VBoxContainer.new(); col.custom_minimum_size.x = 320; col.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN; col.add_theme_constant_override("separation", 10); v.add_child(col)
	if has: col.add_child(_btn("Continue", func(): _start()))
	col.add_child(_btn("New game", func(): if has: main.new_game() else: _start(), not has))
	col.add_child(_btn("Settings", func(): settings(true)))
	col.add_child(_btn("Quit", func(): get_tree().quit()))
	(col.get_child(0) as Button).add_theme_font_size_override("font_size", 19)
	v.add_child(_lab("WASD move · Mouse look · Left mouse mine/fire · E interact · Esc pause", 14, Color(1, 1, 1, 0.55)))

func _start() -> void:
	_clear(); open = ""; get_tree().paused = false; main.capture(true); main.on_title_closed()

# ---------------------------------------------------------------- dialogue
func dialogue(name: String, sub: String, color: Color, lines: Array, done: Callable = Callable()) -> void:
	dlg = {"name": name, "sub": sub, "color": color, "lines": lines, "i": 0, "done": done}
	_dlg_draw()

func _dlg_draw() -> void:
	var v := _show("dialogue", Vector2(900, 0), "", true)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 12); v.add_child(h)
	h.add_child(_lab(dlg.name, 22, dlg.color, true)); h.add_child(_lab(dlg.sub, 15, Color(1, 1, 1, 0.55)))
	var t := _lab("“%s”" % dlg.lines[dlg.i], 20); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size = Vector2(850, 70); v.add_child(t)
	var last: bool = dlg.i >= dlg.lines.size() - 1
	var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_END; v.add_child(row)
	row.add_child(_btn("Farewell  [E]" if last else "Continue  [E]", _dlg_next, true))

func _dlg_next() -> void:
	dlg.i += 1
	if dlg.i >= dlg.lines.size():
		var cb: Callable = dlg.done
		close()
		if cb.is_valid(): cb.call()
	else: _dlg_draw()

# ---------------------------------------------------------------- shop
func shop(tab := "trade") -> void:
	shop_tab = tab
	var sys := Universe.system(Game.s.system)
	var v := _show("shop", Vector2(1040, 640), "Market" if tab == "trade" else "Workshop")
	var tabs := HBoxContainer.new(); tabs.add_theme_constant_override("separation", 8); v.add_child(tabs)
	for t in [["trade", "Trade"], ["upgrades", "Upgrades"], ["style", "Appearance"]]:
		tabs.add_child(_btn(t[1], func(): shop(t[0]), shop_tab == t[0]))
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.custom_minimum_size.y = 470; v.add_child(sc)
	var list := VBoxContainer.new(); list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; list.add_theme_constant_override("separation", 6); sc.add_child(list)
	if tab == "trade":
		var f: String = sys.get("faction", "")
		if f != "": list.add_child(_lab("%s  ·  They sell %s cheaply and pay well for %s." % [Data.FACTIONS[f].name, Data.ITEMS[Data.FACTIONS[f].good].name, Data.ITEMS[Data.FACTIONS[f].wants].name], 14, Data.FACTIONS[f].color))
		var ids: Array = Game.stock_for(sys)
		for id in Game.s.inv: if not ids.has(id) and not Data.ITEMS[id].get("key", false): ids.append(id)
		for id in ids:
			var it: Dictionary = Data.ITEMS[id]
			var sells: bool = Game.stock_for(sys).has(id)
			var bp := Game.buy_price(id, sys); var sp := Game.sell_price(id, sys)
			var row := _row(list, it.color, it.name, "%s   ·   you have %d" % [it.desc, Game.count(id)])
			if sells:
				row.add_child(_btn("Buy 1  (%d)" % bp, func(): _result(Game.buy(id, 1, sys)); shop("trade"), false, Game.s.units >= bp))
				row.add_child(_btn("Buy 10", func(): _result(Game.buy(id, 10, sys)); shop("trade"), false, Game.s.units >= bp * 10))
			row.add_child(_btn("Sell 1  (%d)" % sp, func(): _result(Game.sell(id, 1, sys)); shop("trade"), false, Game.count(id) > 0))
			row.add_child(_btn("Sell all", func(): _result(Game.sell(id, 9999, sys)); shop("trade"), false, Game.count(id) > 0))
	elif tab == "upgrades":
		for id in Data.UPGRADES:
			var u: Dictionary = Data.UPGRADES[id]; var lv := Game.level(id)
			var pips := "●".repeat(lv) + "○".repeat(u.max - lv)
			var row := _row(list, Hud.CYAN, u.name, "%s   %s" % [u.desc, pips])
			if lv >= u.max: row.add_child(_lab("MAX", 15, Hud.AMBER, true))
			else:
				var cost := Data.upgrade_cost(id, lv)
				row.add_child(_btn("Upgrade  (%d)" % cost, func(): _result(Game.buy_upgrade(id)); main.refresh_stats(); shop("upgrades"), true, Game.s.units >= cost))
	else:
		for kind in ["suit", "paint"]:
			list.add_child(_lab("SUIT COLOUR" if kind == "suit" else "SHIP PAINT", 13, Hud.AMBER, true))
			var owned: Array = Game.s.suits if kind == "suit" else Game.s.paints
			for c in (Data.SUITS if kind == "suit" else Data.SHIP_PAINTS):
				var row := _row(list, c.color, c.name, "Equipped" if Game.s[kind] == c.id else ("Owned" if owned.has(c.id) else "%d units" % c.cost))
				if Game.s[kind] != c.id:
					row.add_child(_btn("Equip" if owned.has(c.id) else "Buy", func(): _result(Game.buy_style(kind, c.id)); main.refresh_style(); shop("style"), not owned.has(c.id), owned.has(c.id) or Game.s.units >= c.cost))

func _row(list: Control, color: Color, name: String, sub: String) -> HBoxContainer:
	var pc := PanelContainer.new(); var sb := StyleBoxFlat.new(); sb.bg_color = Color(1, 1, 1, 0.045); sb.set_corner_radius_all(8); sb.set_content_margin_all(10)
	pc.add_theme_stylebox_override("panel", sb); list.add_child(pc)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 10); pc.add_child(h)
	var sw := ColorRect.new(); sw.color = color; sw.custom_minimum_size = Vector2(8, 38); h.add_child(sw)
	var v := VBoxContainer.new(); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; v.add_theme_constant_override("separation", 0); h.add_child(v)
	v.add_child(_lab(name, 17, Color.WHITE, true)); v.add_child(_lab(sub, 13, Color(1, 1, 1, 0.6)))
	return h

func _result(err: String) -> void:
	if err != "": Game.toast.emit(err, "bad"); main.sfx("deny")
	else: main.sfx("pickup", -6.0)

# ---------------------------------------------------------------- inventory
func inventory() -> void:
	var v := _show("inventory", Vector2(900, 560), "Inventory")
	var grid := GridContainer.new(); grid.columns = 3; grid.add_theme_constant_override("h_separation", 8); grid.add_theme_constant_override("v_separation", 8); v.add_child(grid)
	if Game.s.inv.is_empty(): v.add_child(_lab("Nothing yet. Aim at boulders and trees and hold the left mouse button to mine.", 15, Color(1, 1, 1, 0.6)))
	for id in Game.s.inv:
		var it: Dictionary = Data.ITEMS[id]
		var holder := VBoxContainer.new(); holder.custom_minimum_size.x = 276; grid.add_child(holder)
		var row := _row(holder, it.color, "%s  × %d" % [it.name, Game.s.inv[id]], it.desc)
	v.add_child(_lab("CRAFTING", 13, Hud.AMBER, true))
	for id in Data.RECIPES:
		var r: Dictionary = Data.RECIPES[id]
		var need := []
		for k in r.cost: need.append("%d %s (%d)" % [r.cost[k], Data.ITEMS[k].name, Game.count(k)])
		var row := _row(v, Data.ITEMS[id].color, Data.ITEMS[id].name, "Needs " + ", ".join(need))
		row.add_child(_btn("Craft", func(): _result(Game.craft(id)); inventory(), true, Game.can_afford(r.cost)))

# ---------------------------------------------------------------- journal
func journal() -> void:
	var v := _show("journal", Vector2(900, 600), "Journal")
	var sc := ScrollContainer.new(); sc.custom_minimum_size.y = 500; v.add_child(sc)
	var list := VBoxContainer.new(); list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(list)
	for qi in Data.QUESTS.size():
		var q: Dictionary = Data.QUESTS[qi]
		if qi > Game.s.quest.q: break
		var done: bool = qi < Game.s.quest.q
		list.add_child(_lab(("✓  " if done else "") + q.title, 19, Hud.AMBER if not done else Color(1, 1, 1, 0.5), true))
		if done: continue
		for si in q.steps.size():
			if si > Game.s.quest.s: break
			list.add_child(_lab(("     ✓  " if si < Game.s.quest.s else "     ▸  ") + q.steps[si].text, 15, Color(1, 1, 1, 0.5) if si < Game.s.quest.s else Color.WHITE))
	if Game.s.quest.q >= Data.QUESTS.size(): list.add_child(_lab("The story is complete. The galaxy is yours.", 16))
	list.add_child(_lab("\nSTANDING", 13, Hud.AMBER, true))
	for f in Data.FACTIONS: list.add_child(_lab("%s:  %d" % [Data.FACTIONS[f].name, int(Game.s.rep[f])], 15, Data.FACTIONS[f].color))
	list.add_child(_lab("\nRECORD", 13, Hud.AMBER, true))
	var st: Dictionary = Game.s.stats
	list.add_child(_lab("Worlds visited %d   ·   Warps %d   ·   Resources mined %d   ·   Machines destroyed %d   ·   Time %d min" % [st.worlds.size(), st.jumps, st.mined, st.kills, int(st.time / 60.0)], 15))
	if not Game.s.lore.is_empty():
		list.add_child(_lab("\nOVERHEARD", 13, Hud.AMBER, true))
		for l in Game.s.lore: list.add_child(_lab("“%s”" % l, 14, Color(1, 1, 1, 0.75)))

# ---------------------------------------------------------------- galaxy
func galaxy() -> void:
	var v := _show("galaxy", Vector2(1100, 680), "Galaxy map")
	var here := Universe.parse(Game.s.system)
	if sel_star == "": sel_star = Game.s.system; map_center = Vector2(here)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 16); v.add_child(h)
	var cv := Control.new(); cv.custom_minimum_size = Vector2(700, 560); cv.clip_contents = true; h.add_child(cv)
	var cell := 78.0
	cv.draw.connect(func():
		cv.draw_rect(Rect2(Vector2.ZERO, cv.size), Color(0, 0, 0, 0.35))
		var c := cv.size * 0.5
		for gy in range(int(map_center.y) - 5, int(map_center.y) + 6):
			for gx in range(int(map_center.x) - 6, int(map_center.x) + 7):
				var st := Universe.star(gx, gy)
				var p: Vector2 = c + (Vector2(gx, gy) + st.off - map_center) * cell
				var col: Color = st.star.color
				var near: bool = maxi(absi(gx - here.x), absi(gy - here.y)) <= 1
				cv.draw_circle(p, 5.0 if not st.story else 7.0, col if near or st.id == Game.s.system else col.darkened(0.55))
				if st.faction != "": cv.draw_arc(p, 11.0, 0, TAU, 24, Color(Data.FACTIONS[st.faction].color, 0.5), 1.2, true)
				if st.id == Game.s.system: cv.draw_arc(p, 16.0, 0, TAU, 32, Color.WHITE, 2.0, true)
				if st.id == sel_star: cv.draw_arc(p, 21.0, 0, TAU, 32, Hud.AMBER, 2.0, true)
				cv.draw_string(main.hud.font, p + Vector2(-60, 28), st.name, HORIZONTAL_ALIGNMENT_CENTER, 120, 11, Color(1, 1, 1, 0.8 if near else 0.35))
		var goal: String = Game.step().get("system", "")
		if goal != "" and goal != Game.s.system:
			var g := Universe.parse(goal)
			cv.draw_string(main.hud.font_b, c + (Vector2(g) - map_center) * cell + Vector2(-60, -22), "◆ MISSION", HORIZONTAL_ALIGNMENT_CENTER, 120, 12, Hud.AMBER))
	cv.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			var g: Vector2 = (e.position - cv.size * 0.5) / cell + map_center
			var best := ""; var bd := 0.6
			for gy in range(int(g.y) - 1, int(g.y) + 2):
				for gx in range(int(g.x) - 1, int(g.x) + 2):
					var st := Universe.star(gx, gy)
					var d: float = (Vector2(gx, gy) + st.off).distance_to(g)
					if d < bd: bd = d; best = st.id
			if best != "": sel_star = best; galaxy())
	var side := VBoxContainer.new(); side.custom_minimum_size.x = 330; side.add_theme_constant_override("separation", 8); h.add_child(side)
	var sys := Universe.system(sel_star); var sg := Universe.parse(sel_star)
	side.add_child(_lab(sys.name, 26, Color.WHITE, true))
	side.add_child(_lab(sys.star.name + ("  ·  " + Data.FACTIONS[sys.faction].name if sys.faction != "" else "  ·  Unclaimed"), 14, Color(1, 1, 1, 0.65)))
	for p in sys.planets: side.add_child(_lab("  ●  %s   %s" % [p.name, Biomes.TYPES[p.type].label], 14))
	var dist := maxi(absi(sg.x - here.x), absi(sg.y - here.y))
	var sp := Control.new(); sp.size_flags_vertical = Control.SIZE_EXPAND_FILL; side.add_child(sp)
	side.add_child(_lab("Warp Cells: %d" % Game.count("warp_cell"), 16, Hud.CYAN, true))
	if sel_star == Game.s.system: side.add_child(_lab("You are here.", 15, Color(1, 1, 1, 0.6)))
	elif dist > 1: side.add_child(_lab("Out of range. Warp one system at a time.", 15, Color(1, 0.6, 0.5)))
	elif not Game.s.in_space: side.add_child(_lab("Fly to space to warp.", 15, Color(1, 0.6, 0.5)))
	else: side.add_child(_btn("Warp  (1 Warp Cell)", func(): var t := sel_star; close(); main.warp(t), true, Game.count("warp_cell") > 0))
	var nav := HBoxContainer.new(); side.add_child(nav)
	for d in [["◀", Vector2(-3, 0)], ["▲", Vector2(0, -3)], ["▼", Vector2(0, 3)], ["▶", Vector2(3, 0)]]:
		nav.add_child(_btn(d[0], func(): map_center += d[1]; galaxy()))
	nav.add_child(_btn("Home", func(): map_center = Vector2(here); sel_star = Game.s.system; galaxy()))

# ---------------------------------------------------------------- pause & settings
func pause() -> void:
	var v := _show("pause", Vector2(460, 0), "Paused")
	v.add_child(_btn("Resume", close, true))
	v.add_child(_btn("Journal", journal))
	v.add_child(_btn("Settings", func(): settings(false)))
	v.add_child(_btn("Save game", func(): main.persist(); Game.toast.emit("Game saved", "good"); close()))
	v.add_child(_btn("Save and quit to desktop", func(): main.persist(); get_tree().quit()))
	v.add_child(_lab("WASD move · Space jump/jetpack · Shift run/boost · LMB mine/fire\nQ tool · E interact · V view · H med gel · Tab inventory · J journal\nShip: W/S throttle · mouse steer · A/D roll · G land · X stop · M map", 13, Color(1, 1, 1, 0.55)))

func settings(from_title: bool) -> void:
	var back := func(): if from_title: title() else: pause()
	var v := _show("settings", Vector2(560, 0), "Settings")
	var st: Dictionary = Game.s.settings
	var q := HBoxContainer.new(); v.add_child(q); q.add_child(_lab("Graphics   ", 16))
	for i in 4: q.add_child(_btn(["Low", "Medium", "High", "Ultra"][i], func(): st.quality = i; main.apply_quality(); settings(from_title), st.quality == i))
	v.add_child(_lab("Quality changes apply the next time a world loads.", 12, Color(1, 1, 1, 0.5)))
	v.add_child(_slider("Volume", st.volume, 0.0, 1.0, func(x): st.volume = x; if main.audio: main.audio.set_volume(x)))
	v.add_child(_slider("Mouse sensitivity", st.sens, 0.3, 2.5, func(x): st.sens = x))
	v.add_child(_slider("Field of view", st.fov, 60.0, 100.0, func(x): st.fov = x; main.apply_fov()))
	var row := HBoxContainer.new(); v.add_child(row)
	row.add_child(_btn("Invert Y: %s" % ("on" if st.invert_y else "off"), func(): st.invert_y = not st.invert_y; settings(from_title)))
	row.add_child(_btn("Music: %s" % ("on" if st.music else "off"), func(): st.music = not st.music; if main.audio: main.audio.set_music(st.music); settings(from_title)))
	v.add_child(_btn("Back", back, true))

func _slider(name: String, val: float, lo: float, hi: float, cb: Callable) -> Control:
	var h := HBoxContainer.new(); var l := _lab(name, 16); l.custom_minimum_size.x = 200; h.add_child(l)
	var sl := HSlider.new(); sl.min_value = lo; sl.max_value = hi; sl.step = (hi - lo) / 100.0; sl.value = val; sl.custom_minimum_size.x = 280
	sl.value_changed.connect(cb); h.add_child(sl)
	return h

# ---------------------------------------------------------------- station & endings
func station() -> void:
	var sys := Universe.system(Game.s.system)
	var v := _show("station", Vector2(520, 0), sys.station.name)
	v.add_child(_lab("Docked. Hull repaired.", 15, Color(1, 1, 1, 0.65)))
	v.add_child(_btn("Market", func(): on_close = station; shop("trade")))
	v.add_child(_btn("Workshop", func(): on_close = station; shop("upgrades")))
	if sys.id == Data.HOME: v.add_child(_btn("Speak with Envoy Seren", func(): on_close = Callable(); close(); main.talk("envoy", station)))
	v.add_child(_btn("Contracts", func(): close(); main.contracts(sys.get("faction", ""), 99, station)))
	v.add_child(_btn("Launch", func(): on_close = Callable(); close(); main.undock(), true))

func choice() -> void:
	var v := _show("choice", Vector2(820, 0))
	open = "choice"
	v.add_child(_lab("THE ANCIENT GATE", 30, Color(0.8, 0.6, 1.0), true))
	var t := _lab("Three shards hum in your hands. The ring of the Gate waits, a lock with two directions. Seal it, and the star lanes wake. Open it, and meet what the Builders hid from.", 18); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size.x = 760; v.add_child(t)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12); v.add_child(row)
	row.add_child(_btn("Seal the Gate", func(): _end("seal"), true))
	row.add_child(_btn("Open the Gate", func(): _end("open")))

func _end(which: String) -> void:
	Game.s.flags["ending"] = which
	Game.story("interact", {"what": "gate"})
	var e: Dictionary = Data.ENDINGS[which]
	var v := _show("ending", Vector2(860, 0))
	v.add_child(_lab(e.title, 34, Hud.AMBER, true))
	var t := _lab(e.text, 18); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size.x = 800; v.add_child(t)
	var st: Dictionary = Game.s.stats
	v.add_child(_lab("Worlds visited %d  ·  Warps %d  ·  Time %d min" % [st.worlds.size(), st.jumps, int(st.time / 60.0)], 14, Color(1, 1, 1, 0.6)))
	v.add_child(_btn("Keep exploring", func(): close(); main.persist(), true))
