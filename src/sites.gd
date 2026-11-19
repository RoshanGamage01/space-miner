class_name Sites
## Lays out settlements and points of interest on a planet.

static func build(world, s: Dictionary) -> void:
	var node := Node3D.new(); node.position = s.pos; node.name = s.type
	world.add_child(node); s.node = node
	var rnd := RandomNumberGenerator.new(); rnd.seed = hash([world.desc.seed, s.index])
	var accent: Color = Data.FACTIONS[s.faction].color if Data.FACTIONS.has(s.faction) else Color(0.8, 0.8, 0.8)
	match s.type:
		"village": _village(world, s, node, rnd, accent, false)
		"capital": _village(world, s, node, rnd, accent, true)
		"outpost": _outpost(world, s, node, rnd)
		"ruins": _ruins(world, s, node, rnd)
		"gate": _gate(world, s, node)
		"crash": _crash(world, s, node, rnd)

static func _put(node: Node3D, child: Node3D, pos: Vector3, yaw: float) -> void:
	child.position = pos; child.rotation.y = yaw; node.add_child(child)

static func _npc(world, s: Dictionary, local: Vector3, opts: Dictionary) -> Actor:
	var a := Actor.new(world, "npc", s.pos + local, opts)
	world.add_child(a); world.actors.append(a)
	return a

static func _village(world, s: Dictionary, node: Node3D, rnd: RandomNumberGenerator, accent: Color, capital: bool) -> void:
	var ring := 30.0 if not capital else 58.0
	var count := 6 if not capital else 12
	if capital:
		_put(node, Build.spire(accent), Vector3.ZERO, 0.0)
	else:
		# Plaza beacon.
		var bc := Build.pylon(accent, 6.0); _put(node, bc, Vector3.ZERO, 0.0)
		Kit.inst(Kit.cyl(7.0, 7.4, 0.3, 40), Build.floor_mat(), node, Vector3(0, 0.15, 0))
	for i in count:
		var a := TAU * i / count + 0.35
		var r := ring + (rnd.randf() * 8.0 if i % 2 == 0 else -4.0)
		var pos := Vector3(cos(a) * r, 0, sin(a) * r)
		var yaw := atan2(-pos.x, -pos.z)
		if i % 4 == 3: _put(node, Build.dome(accent, 5.5 if not capital else 7.0), pos, yaw)
		else: _put(node, Build.hab(accent, rnd.randf_range(8.0, 11.0), 6.0, 2 if (capital and i % 3 == 0) else 1), pos, yaw)
		var lp := Vector3(cos(a + 0.26) * (r - 9.0), 0, sin(a + 0.26) * (r - 9.0))
		Build.lamp(node, lp, atan2(-lp.x, -lp.z))
	var pad_pos := Vector3(ring + 34.0, 0, 6.0)
	_put(node, Build.pad(accent), pad_pos, 0.0)
	_put(node, Build.mast(accent, 18.0 if not capital else 26.0), Vector3(-ring - 12.0, 0, -8.0), 0.0)
	# Market.
	var mp := Vector3(9.0, 0, 15.0) if not capital else Vector3(22.0, 0, 24.0)
	var myaw := atan2(-mp.x, -mp.z)
	_put(node, Build.stall(accent), mp, myaw)
	var front := Vector3(sin(myaw), 0, cos(myaw))
	_npc(world, s, mp - front * 0.6, {"faction": s.faction, "role": "trader", "name": "Trader", "tint": 0.3})
	world.add_interact(s.pos + mp + front * 2.2, 3.4, "Trade", func(): world.main.open_shop("trade"))
	var mp2 := Vector3(-mp.x, 0, mp.z)
	var myaw2 := atan2(-mp2.x, -mp2.z)
	_put(node, Build.stall(accent.lerp(Color(1, 0.8, 0.3), 0.5)), mp2, myaw2)
	var front2 := Vector3(sin(myaw2), 0, cos(myaw2))
	_npc(world, s, mp2 - front2 * 0.6, {"faction": s.faction, "role": "engineer", "name": "Engineer", "tint": 0.8})
	world.add_interact(s.pos + mp2 + front2 * 2.2, 3.4, "Upgrades and paint", func(): world.main.open_shop("upgrades"))
	# Named character.
	if s.npc != "":
		var np := Vector3(0, 0, 9.5) if not capital else Vector3(0, 0, 19.0)
		var who: Dictionary = Data.NPCS[s.npc]
		_npc(world, s, np, {"faction": s.faction, "role": s.npc, "name": who.name, "tint": 0.9, "scale": 1.12})
		world.add_interact(s.pos + np, 4.0, "Talk to " + who.name, func(): world.main.talk(s.npc))
	# Contract board.
	var bp := Vector3(-6.0, 0, 10.0) if not capital else Vector3(-9.0, 0, 20.0)
	Kit.inst(Kit.bbox(Vector3(0.3, 2.2, 0.3), 0.05), Build.dark(), node, bp + Vector3(0, 1.1, 0))
	Kit.inst(Kit.bbox(Vector3(1.6, 1.0, 0.08), 0.03), Kit.glow(accent, 2.0), node, bp + Vector3(0, 2.0, 0.2), Vector3(-0.2, 0, 0))
	world.add_interact(s.pos + bp + Vector3(0, 0, 1.5), 3.0, "Contracts", func(): world.main.contracts(s.faction, s.index))
	# Townsfolk.
	for i in (5 if not capital else 9):
		var a := rnd.randf() * TAU; var r := rnd.randf_range(8.0, ring - 8.0)
		var folk := _npc(world, s, Vector3(cos(a) * r, 0, sin(a) * r), {"faction": s.faction, "tint": rnd.randf_range(0.2, 0.7), "scale": rnd.randf_range(0.9, 1.05)})
		folk.set_meta("lore", true)
	# Yard dressing.
	for i in 10:
		var a := rnd.randf() * TAU; var r := rnd.randf_range(ring - 10.0, ring + 16.0)
		var p: String = ["old_military_crate", "Barrel_01", "barrel_03", "propane_tank", "portable_generator", "tool_cart", "plastic_crate_02", "metal_jerrycan", "utility_box_01", "old_military_compressor"][rnd.randi() % 10]
		Kit.prop(p, node, Vector3(cos(a) * r, 0, sin(a) * r), rnd.randf() * TAU, 1.25)

static func _outpost(world, s: Dictionary, node: Node3D, rnd: RandomNumberGenerator) -> void:
	for i in 3:
		var a := TAU * i / 3.0 + 0.5
		var pos := Vector3(cos(a) * 17.0, 0, sin(a) * 17.0)
		_put(node, Build.bunker(), pos, atan2(-pos.x, -pos.z))
	for i in 9:
		var a := TAU * i / 9.0
		Kit.prop("concrete_road_barrier", node, Vector3(cos(a) * 31.0, 0, sin(a) * 31.0), -a + PI / 2, 1.6)
	for i in 3:
		var a := TAU * i / 3.0 + 1.5
		var p := Vector3(cos(a) * 26.0, 0, sin(a) * 26.0)
		Kit.prop("flood_lights", node, p, atan2(-p.x, -p.z), 1.6)
		var sp := SpotLight3D.new(); sp.position = p + Vector3(0, 3.6, 0); sp.light_color = Color(1.0, 0.9, 0.75); sp.light_energy = 12.0; sp.spot_range = 45.0; sp.spot_angle = 38.0; sp.shadow_enabled = true
		node.add_child(sp); sp.look_at_from_position(sp.position, Vector3(0, 0.5, 0), Vector3.UP)
	for i in 8:
		var a := rnd.randf() * TAU; var r := rnd.randf_range(4.0, 26.0)
		Kit.prop(["old_military_crate", "Barrel_01", "propane_tank", "metal_jerrycan", "portable_generator"][rnd.randi() % 5], node, Vector3(cos(a) * r, 0, sin(a) * r), rnd.randf() * TAU, 1.3)
	Kit.inst(Kit.cyl(1.2, 1.5, 0.5, 16), Build.dark(), node, Vector3(0, 0.25, 0))
	Kit.light(node, Vector3(0, 2.0, 0), Color(1.0, 0.4, 0.15), 4.0, 22.0)
	for i in 5:
		var a := TAU * i / 5.0 + rnd.randf()
		var e := Actor.new(world, "rogue", s.pos + Vector3(cos(a) * 11.0, 0, sin(a) * 11.0))
		world.add_child(e); world.actors.append(e)
	var crate := Kit.prop("old_military_crate", node, Vector3(2.5, 0, 1.0), 0.4, 1.8)
	var key := "loot:%s:%d" % [world._key(), s.index]
	world.add_interact(s.pos + Vector3(2.5, 0.5, 1.0), 3.2, "Open salvage crate", func():
		Game.s.flags[key] = true; var u := 600 + (hash(key) % 5) * 150
		Game.s.units += u; Game.add_item("aetherium", 6); Game.toast.emit("Salvage: %d units and 6 Aetherium" % u, "loot"); world.main.sfx("pickup"),
		func(): return not Game.s.flags.has(key))

static func _ruins(world, s: Dictionary, node: Node3D, rnd: RandomNumberGenerator) -> void:
	var stone := Kit.pbr("rock_wall_08", 0.2, Color(0.75, 0.75, 0.8))
	Kit.inst(Kit.cyl(13.0, 14.5, 0.8, 48), stone, node, Vector3(0, 0.4, 0))
	Kit.inst(Kit.cyl(6.0, 6.5, 0.6, 32), stone, node, Vector3(0, 1.1, 0))
	for i in 10:
		var a := TAU * i / 10.0
		var p := Vector3(cos(a) * 11.0, 0.8, sin(a) * 11.0)
		var hh := rnd.randf_range(2.5, 9.0) if i % 3 != 0 else 9.0
		var col := Node3D.new(); _put(node, col, p, rnd.randf())
		Kit.inst(Kit.cyl(0.7, 0.85, hh, 14), stone, col, Vector3(0, hh * 0.5, 0))
		Kit.inst(Kit.bbox(Vector3(2.0, 0.5, 2.0), 0.08), stone, col, Vector3(0, 0.25, 0))
		if hh > 8.5: Kit.inst(Kit.bbox(Vector3(2.2, 0.6, 2.2), 0.1), stone, col, Vector3(0, hh + 0.3, 0))
		else: col.rotation.z = rnd.randf_range(-0.06, 0.06)
		Build.solid(node, Vector3(1.6, hh, 1.6), p + Vector3(0, hh * 0.5, 0))
	var fort: PackedScene = load("res://assets/models/modular_fort_01/modular_fort_01.gltf")
	if fort:
		var pieces: Array = []
		var root := fort.instantiate()
		for mi in root.find_children("*", "MeshInstance3D", true, false): pieces.append(mi.mesh)
		root.free()
		for i in 7:
			var a := TAU * i / 7.0 + 0.4; var r := rnd.randf_range(22.0, 40.0)
			var m: Mesh = pieces[rnd.randi() % pieces.size()]
			var mi := MeshInstance3D.new(); mi.mesh = m
			var ab := m.get_aabb()
			mi.position = Vector3(cos(a) * r, -ab.position.y - 0.4, sin(a) * r) - Vector3(ab.get_center().x, 0, ab.get_center().z); mi.rotation.y = rnd.randf() * TAU
			node.add_child(mi)
			mi.create_convex_collision(true, true)
	Kit.prop("gothic_statue", node, Vector3(0, 1.4, -4.0), 0.0, 1.8)
	for i in 3:
		var a := TAU * i / 3.0
		var e := Actor.new(world, "sentinel", s.pos + Vector3(cos(a) * 17.0, 0, sin(a) * 17.0))
		world.add_child(e); world.actors.append(e)
	if s.relic:
		var key := "relic:%s:%d" % [world._key(), s.index]
		var core := Kit.inst(Deposit._crystals(11, 5, 1.2, 0.22), Kit.glow(Color(0.8, 0.55, 1.0), 6.0), node, Vector3(0, 2.0, 0)); core.name = "Core"
		Kit.light(node, Vector3(0, 3.0, 0), Color(0.8, 0.55, 1.0), 5.0, 26.0)
		if Game.s.flags.has(key): core.visible = false
		world.add_interact(s.pos + Vector3(0, 1.4, 0), 5.5, "Take the Echo Core", func():
			Game.s.flags[key] = true; core.visible = false; world.main.sfx("pickup")
			if Game.story("interact", {"what": "relic"}) == "": Game.s.units += 900; Game.toast.emit("Builder relic recovered: 900 units", "loot"),
			func(): return not Game.s.flags.has(key))
	else:
		var lk := "lore:%s:%d" % [world._key(), s.index]
		world.add_interact(s.pos + Vector3(0, 1.4, 0), 5.0, "Read the inscription", func():
			Game.s.flags[lk] = true; Game.s.units += 250
			world.main.say("Builder inscription", "", ["We closed the door and called the quiet a mercy.", "Those who come after: forgive us the dark between your stars."]),
			func(): return not Game.s.flags.has(lk))

static func _gate(world, s: Dictionary, node: Node3D) -> void:
	var accent := Color(0.65, 0.45, 1.0)
	_put(node, Build.gate(accent), Vector3.ZERO, 0.0)
	for i in 8:
		var a := TAU * i / 8.0 + 0.2
		_put(node, Build.pylon(accent, 11.0), Vector3(cos(a) * 44.0, 0, sin(a) * 44.0), a)
	world.add_interact(s.pos + Vector3(0, 3.0, 9.0), 8.0, "Approach the Gate", func(): world.main.use_gate(),
		func(): return Game.s.flags.has("warden_down") and not Game.s.flags.has("ending"))
	world.set_meta("gate_site", s)

static func _crash(world, s: Dictionary, node: Node3D, rnd: RandomNumberGenerator) -> void:
	for i in 7:
		var a := rnd.randf() * TAU; var r := rnd.randf_range(7.0, 16.0)
		Kit.prop(["old_military_crate", "metal_jerrycan", "plastic_crate_02", "propane_tank"][rnd.randi() % 4], node, Vector3(cos(a) * r, 0, sin(a) * r), rnd.randf() * TAU, 1.2).rotation.z = rnd.randf_range(-0.5, 0.5)
