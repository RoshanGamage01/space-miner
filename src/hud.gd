class_name Hud extends CanvasLayer
## Heads-up display: mission, vitals, markers, prompts and messages.

var main
var root := Control.new()
var font: Font
var font_b: Font
var mission_title: Label; var mission_text: Label; var mission_hint: Label
var place_name: Label; var place_sub: Label
var units: Label; var tool_lbl: Label
var prompt: Label
var bars := {}
var toasts: VBoxContainer
var banner_t: Label; var banner_s: Label
var vignette: ColorRect
var fade: ColorRect
var overlay: Control
var ship_box: Label
var boss_box: Control; var boss_bar: ProgressBar; var boss_name: Label
var markers: Array = [] # {pos: Vector3, text, color}
var hurt_a := 0.0
var tool_flash := 0.0
const AMBER := Color(1.0, 0.78, 0.35)
const CYAN := Color(0.55, 0.9, 1.0)

func _init(m) -> void:
	main = m; layer = 5
	var sf := SystemFont.new(); sf.font_names = PackedStringArray(["SF Pro Display", "Helvetica Neue", "Inter", "Segoe UI", "Noto Sans", "DejaVu Sans"]); sf.font_weight = 400
	var sb := SystemFont.new(); sb.font_names = sf.font_names; sb.font_weight = 650
	font = sf; font_b = sb
	root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(root)
	overlay = Control.new(); overlay.set_anchors_preset(Control.PRESET_FULL_RECT); overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.draw.connect(_draw_overlay); root.add_child(overlay)
	vignette = ColorRect.new(); vignette.set_anchors_preset(Control.PRESET_FULL_RECT); vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var vs := Shader.new(); vs.code = "shader_type canvas_item; uniform vec4 col : source_color; uniform float amt = 0.0; void fragment(){ float d = distance(UV, vec2(0.5)); COLOR = vec4(col.rgb, smoothstep(0.25, 0.8, d) * amt); }"
	var vm := ShaderMaterial.new(); vm.shader = vs; vignette.material = vm; root.add_child(vignette)
	var tl := _vbox(Control.PRESET_TOP_LEFT, Vector2(36, 30)); tl.custom_minimum_size.x = 620
	mission_title = _label("", 13, AMBER, true); mission_title.uppercase = true
	mission_text = _label("", 21, Color.WHITE, true); mission_hint = _label("", 15, Color(1, 1, 1, 0.62))
	mission_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; mission_text.custom_minimum_size.x = 600
	for l in [mission_title, mission_text, mission_hint]: tl.add_child(l)
	var tr := _vbox(Control.PRESET_TOP_RIGHT, Vector2(-36, 30)); tr.alignment = BoxContainer.ALIGNMENT_BEGIN
	tr.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	place_name = _label("", 24, Color.WHITE, true); place_sub = _label("", 14, Color(1, 1, 1, 0.65))
	place_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; place_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	tr.add_child(place_name); tr.add_child(place_sub)
	var bl := _vbox(Control.PRESET_BOTTOM_LEFT, Vector2(36, -30)); bl.grow_vertical = Control.GROW_DIRECTION_BEGIN
	for b in [["health", Color(1.0, 0.36, 0.4)], ["shield", Color(0.45, 0.75, 1.0)], ["jetpack", Color(1.0, 0.7, 0.3)], ["hazard", Color(0.8, 0.6, 1.0)]]:
		var lab := _label(b[0].to_upper(), 10, Color(1, 1, 1, 0.6), true)
		var pb := ProgressBar.new(); pb.custom_minimum_size = Vector2(250, 5); pb.show_percentage = false; pb.max_value = 1.0
		var bg := StyleBoxFlat.new(); bg.bg_color = Color(1, 1, 1, 0.14); bg.set_corner_radius_all(3)
		var fg := StyleBoxFlat.new(); fg.bg_color = b[1]; fg.set_corner_radius_all(3)
		pb.add_theme_stylebox_override("background", bg); pb.add_theme_stylebox_override("fill", fg)
		bl.add_child(lab); bl.add_child(pb); bars[b[0]] = [pb, lab]
	ship_box = _label("", 15, Color.WHITE, true); bl.add_child(ship_box)
	var br := _vbox(Control.PRESET_BOTTOM_RIGHT, Vector2(-36, -30)); br.grow_vertical = Control.GROW_DIRECTION_BEGIN; br.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	units = _label("", 26, AMBER, true); tool_lbl = _label("", 14, CYAN, true)
	units.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; tool_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	br.add_child(units); br.add_child(tool_lbl)
	prompt = _label("", 18, Color.WHITE, true); prompt.set_anchors_preset(Control.PRESET_CENTER); prompt.position += Vector2(-300, 70)
	prompt.custom_minimum_size = Vector2(600, 0); prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; root.add_child(prompt)
	toasts = VBoxContainer.new(); toasts.set_anchors_preset(Control.PRESET_CENTER_TOP); toasts.position = Vector2(-320, 120); toasts.custom_minimum_size.x = 640
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE; toasts.add_theme_constant_override("separation", 6); root.add_child(toasts)
	banner_t = _label("", 54, Color.WHITE, true); banner_s = _label("", 17, AMBER, true)
	for i in 2:
		var l: Label = [banner_t, banner_s][i]
		l.set_anchors_preset(Control.PRESET_CENTER); l.custom_minimum_size = Vector2(1400, 0); l.position += Vector2(-700, -210 + i * 74)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; l.modulate.a = 0.0; l.uppercase = true; root.add_child(l)
	boss_box = Control.new(); boss_box.set_anchors_preset(Control.PRESET_CENTER_TOP); boss_box.position = Vector2(-300, 64); boss_box.visible = false; root.add_child(boss_box)
	boss_name = _label("", 14, Color(1.0, 0.5, 0.4), true); boss_name.custom_minimum_size.x = 600; boss_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; boss_box.add_child(boss_name)
	boss_bar = ProgressBar.new(); boss_bar.custom_minimum_size = Vector2(600, 6); boss_bar.position.y = 24; boss_bar.show_percentage = false; boss_bar.max_value = 1.0
	var fg2 := StyleBoxFlat.new(); fg2.bg_color = Color(1.0, 0.4, 0.3); boss_bar.add_theme_stylebox_override("fill", fg2); boss_box.add_child(boss_bar)
	fade = ColorRect.new(); fade.set_anchors_preset(Control.PRESET_FULL_RECT); fade.color = Color(0, 0, 0, 1); fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(fade)
	Game.toast.connect(toast)

func _vbox(preset: int, off: Vector2) -> VBoxContainer:
	var v := VBoxContainer.new(); v.set_anchors_preset(preset); v.position += off; v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 3); root.add_child(v)
	return v

func _label(text: String, size: int, color: Color, bold := false) -> Label:
	var l := Label.new(); l.text = text
	l.add_theme_font_override("font", font_b if bold else font); l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55)); l.add_theme_constant_override("shadow_offset_y", 1); l.add_theme_constant_override("shadow_outline_size", 4)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func toast(text: String, kind := "info") -> void:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(0.04, 0.06, 0.09, 0.78); sb.set_corner_radius_all(8); sb.set_content_margin_all(10)
	sb.border_width_left = 3; sb.border_color = {"good": Color(0.4, 1.0, 0.6), "bad": Color(1.0, 0.4, 0.4), "loot": AMBER}.get(kind, CYAN)
	p.add_theme_stylebox_override("panel", sb)
	var l := _label(text, 16, Color.WHITE); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.custom_minimum_size.x = 600; p.add_child(l)
	toasts.add_child(p)
	if toasts.get_child_count() > 4: toasts.get_child(0).queue_free()
	var tw := create_tween(); p.modulate.a = 0.0
	tw.tween_property(p, "modulate:a", 1.0, 0.25); tw.tween_interval(3.2 + text.length() * 0.035); tw.tween_property(p, "modulate:a", 0.0, 0.5); tw.tween_callback(p.queue_free)

func banner(title: String, sub := "", color := Color.WHITE) -> void:
	banner_t.text = title; banner_s.text = sub; banner_t.add_theme_color_override("font_color", color)
	for l in [banner_t, banner_s]:
		l.modulate.a = 0.0
		var t2 := create_tween(); t2.tween_property(l, "modulate:a", 1.0, 0.6); t2.tween_interval(2.6); t2.tween_property(l, "modulate:a", 0.0, 1.0)

func fade_to(a: float, time := 0.5) -> void:
	var tw := create_tween(); tw.tween_property(fade, "color:a", a, time)
	await tw.finished

func hurt(shield_only: bool) -> void:
	hurt_a = 0.5 if shield_only else 0.9
	(vignette.material as ShaderMaterial).set_shader_parameter("col", Color(0.3, 0.6, 1.0) if shield_only else Color(1.0, 0.1, 0.1))

func flash_tool() -> void: tool_flash = 1.0

func boss(name: String, frac: float) -> void:
	boss_box.visible = frac > 0.0; boss_name.text = name; boss_bar.value = frac

func _process(dt: float) -> void:
	hurt_a = maxf(0.0, hurt_a - dt * 1.4)
	var low := 0.0
	if main.world and main.mode == "foot" and main.world is SurfaceWorld:
		low = clampf(1.0 - main.world.player.health / 35.0, 0.0, 1.0) * 0.5
		if low > hurt_a: (vignette.material as ShaderMaterial).set_shader_parameter("col", Color(1.0, 0.1, 0.1))
	(vignette.material as ShaderMaterial).set_shader_parameter("amt", maxf(hurt_a, low))
	var show: bool = main.playing() or main.in_panel()
	root.modulate.a = move_toward(root.modulate.a, 1.0 if main.started else 0.0, dt * 3.0)
	if not main.started or main.world == null: return
	var q: Dictionary = Game.quest_text()
	mission_title.text = q.title; mission_text.text = q.text; mission_hint.text = q.hint
	if Game.s.bounty != null: mission_hint.text += ("\n" if q.hint != "" else "") + "Contract: " + Game.s.bounty.text
	units.text = "%s units" % _fmt(Game.s.units)
	var foot: bool = main.mode == "foot"
	for k in bars: for c in bars[k]: c.visible = foot
	ship_box.visible = not foot
	if foot and main.world is SurfaceWorld:
		var p: Player = main.world.player
		bars.health[0].value = p.health / 100.0; bars.shield[0].value = p.shield / Game.shield_max()
		bars.jetpack[0].value = p.jet / Game.jet_fuel(); bars.hazard[0].value = p.hazard
		for c in bars.hazard: c.visible = main.world.biome.hazard != ""
		tool_lbl.text = ("MINING BEAM" if p.tool_ == "mine" else "BOLT CASTER") + "   Q switch · V view · Tab inventory"
	elif main.ship:
		var s: Ship = main.ship
		var alt := "" if s.in_space else "   ALT %d m" % int(s.alt)
		ship_box.text = "SPEED %d m/s%s\nTHROTTLE %d%%   HULL %d%%" % [int(s.speed), alt, int(s.throttle * 100.0), int(100.0 * s.hull / Game.ship_hull())]
		tool_lbl.text = "G land · V view · M galaxy map · X cut throttle" if not s.in_space else "M galaxy map · V view · X cut throttle"
	overlay.queue_redraw()

func _fmt(n: int) -> String:
	var s := str(n); var out := ""
	for i in s.length():
		if i > 0 and (s.length() - i) % 3 == 0: out += ","
		out += s[i]
	return out

func _draw_overlay() -> void:
	if not main.started or main.world == null or not main.playing(): return
	var size := overlay.size; var c := size * 0.5
	var cam: Camera3D = main.world.cam
	# Crosshair.
	var col := Color(1, 1, 1, 0.85)
	if main.mode == "foot":
		var p: Player = main.world.player
		if p.aim_body != null and (p.aim_body.has_meta("res") or p.aim_body.has_method("damage") or (p.aim_body.get_parent() and p.aim_body.get_parent().has_method("damage"))): col = CYAN
		overlay.draw_circle(c, 2.0, col)
		overlay.draw_arc(c, 9.0, 0, TAU, 32, Color(col.r, col.g, col.b, 0.45), 1.5, true)
	else:
		var s: Ship = main.ship
		var aim := s.global_position + s.forward() * 400.0
		if not cam.is_position_behind(aim):
			var sp := cam.unproject_position(aim)
			overlay.draw_arc(sp, 14.0, 0, TAU, 32, Color(1, 1, 1, 0.7), 1.5, true); overlay.draw_circle(sp, 2.0, Color.WHITE)
	# World markers.
	for m in markers:
		var behind := cam.is_position_behind(m.pos)
		var sp := cam.unproject_position(m.pos)
		if behind: sp = c + (c - sp).normalized() * 9999.0
		var pad := 70.0
		var cl := Vector2(clampf(sp.x, pad, size.x - pad), clampf(sp.y, pad, size.y - pad))
		var mc: Color = m.get("color", AMBER)
		var pts := PackedVector2Array([cl + Vector2(0, -9), cl + Vector2(9, 0), cl + Vector2(0, 9), cl + Vector2(-9, 0)])
		overlay.draw_colored_polygon(pts, Color(mc.r, mc.g, mc.b, 0.9))
		overlay.draw_polyline(pts + PackedVector2Array([pts[0]]), Color(0, 0, 0, 0.5), 1.5, true)
		var d: float = cam.global_position.distance_to(m.pos) * m.get("scale", 1.0)
		var dist := "%d m" % int(d) if d < 1000.0 else "%.1f km" % (d / 1000.0)
		var txt: String = m.text
		overlay.draw_string(font_b, cl + Vector2(-150, 28), txt, HORIZONTAL_ALIGNMENT_CENTER, 300, 14, Color(mc.r, mc.g, mc.b))
		overlay.draw_string(font, cl + Vector2(-150, 45), dist, HORIZONTAL_ALIGNMENT_CENTER, 300, 12, Color(1, 1, 1, 0.75))
