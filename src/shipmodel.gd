class_name ShipModel
## The player's starship, built from lofted hull sections with PBR paint.

static func build(paint: Color) -> Node3D:
	var root := Node3D.new(); root.name = "ShipModel"
	var hull_m := Kit.metal(paint, 0.32, 0.7, 0.9)
	var dark := Kit.metal(Color(0.08, 0.085, 0.1), 0.45, 0.9, 1.4)
	var trim := Kit.metal(Color(0.5, 0.52, 0.56), 0.28, 1.0, 1.2)
	var glow_c := Color(0.35, 0.8, 1.0)
	# Fuselage: nose at -Z.
	var fus := Kit.loft([
		[-6.2, 0.05, 0.04, 0.05, 2.0], [-5.6, 0.34, 0.2, 0.06, 2.2], [-4.4, 0.78, 0.44, 0.1, 2.4], [-2.8, 1.12, 0.66, 0.2, 2.6],
		[-1.0, 1.3, 0.82, 0.3, 2.8], [0.8, 1.36, 0.86, 0.32, 3.0], [2.4, 1.3, 0.8, 0.3, 3.0], [3.6, 1.1, 0.66, 0.28, 2.8], [4.3, 0.86, 0.5, 0.28, 2.6]], 36)
	Kit.inst(fus, hull_m, root)
	# Belly keel and spine in dark trim.
	Kit.inst(Kit.loft([[-4.0, 0.3, 0.14, -0.3, 3.0], [-1.0, 0.62, 0.22, -0.48, 3.0], [2.6, 0.66, 0.22, -0.46, 3.0], [4.0, 0.4, 0.14, -0.2, 3.0]], 20), dark, root)
	Kit.inst(Kit.loft([[0.2, 0.2, 0.12, 1.12, 3.0], [1.6, 0.34, 0.2, 1.14, 3.0], [3.6, 0.3, 0.16, 0.92, 3.0], [4.4, 0.1, 0.06, 0.8, 3.0]], 16), dark, root)
	# Canopy.
	var can := Kit.loft([[-3.9, 0.3, 0.1, 0.5, 2.0], [-3.1, 0.62, 0.36, 0.62, 2.2], [-2.0, 0.74, 0.52, 0.76, 2.3], [-0.9, 0.7, 0.46, 0.82, 2.3], [0.0, 0.5, 0.26, 0.86, 2.2], [0.5, 0.2, 0.08, 0.9, 2.0]], 28)
	var cm := Kit.inst(can, Kit.glass(Color(0.03, 0.07, 0.1), 0.42), root); cm.name = "Canopy"
	Kit.inst(Kit.loft([[-3.95, 0.34, 0.12, 0.48, 2.0], [-3.0, 0.68, 0.2, 0.5, 2.4], [-1.0, 0.78, 0.2, 0.6, 2.4], [0.6, 0.3, 0.1, 0.84, 2.0]], 24), trim, root)
	for side in [-1.0, 1.0]:
		# Wings: swept, tapered.
		var w := Kit.hull(PackedVector3Array([
			Vector3(side * 1.0, 0.14, -1.6), Vector3(side * 1.0, -0.06, -1.6), Vector3(side * 1.0, 0.2, 3.2), Vector3(side * 1.0, -0.1, 3.2),
			Vector3(side * 5.4, 0.0, 1.9), Vector3(side * 5.4, -0.07, 1.9), Vector3(side * 5.4, 0.0, 3.4), Vector3(side * 5.4, -0.07, 3.4),
			Vector3(side * 3.0, 0.12, 0.2), Vector3(side * 3.0, 0.14, 3.3)]))
		Kit.inst(w, hull_m, root)
		Kit.inst(Kit.hull(PackedVector3Array([Vector3(side * 1.1, 0.16, 2.3), Vector3(side * 5.3, 0.02, 2.9), Vector3(side * 5.3, 0.02, 3.42), Vector3(side * 1.1, 0.22, 3.25), Vector3(side * 1.1, 0.12, 2.3), Vector3(side * 5.3, -0.02, 3.42), Vector3(side * 1.1, 0.12, 3.25)])), dark, root, Vector3(0, 0.012, 0))
		# Wingtip pods with nav lights.
		Kit.inst(Kit.loft([[1.2, 0.02, 0.02, 0, 2.0], [1.8, 0.16, 0.16, 0, 2.0], [3.2, 0.18, 0.18, 0, 2.0], [3.8, 0.1, 0.1, 0, 2.0]], 14), trim, root, Vector3(side * 5.45, -0.03, 0))
		Kit.inst(_sphere(0.07), Kit.glow(Color(1, 0.2, 0.15) if side < 0 else Color(0.2, 1, 0.3), 6.0), root, Vector3(side * 5.45, -0.03, 1.25))
		# Engines.
		var eng := Node3D.new(); eng.position = Vector3(side * 1.75, 0.38, 3.0); root.add_child(eng)
		Kit.inst(Kit.loft([[-2.6, 0.2, 0.2, 0, 2.0], [-2.0, 0.5, 0.5, 0, 2.0], [0.2, 0.6, 0.6, 0, 2.0], [1.5, 0.52, 0.52, 0, 2.0]], 24, false), hull_m, eng)
		Kit.inst(Kit.loft([[-2.62, 0.21, 0.21, 0, 2.0], [-2.3, 0.4, 0.4, 0, 2.0]], 24), dark, eng)
		# Exhaust: tapered bell, inner glow, turbine cone and petals.
		Kit.inst(Kit.loft([[1.5, 0.52, 0.52, 0, 2.0], [1.9, 0.47, 0.47, 0, 2.0], [2.35, 0.4, 0.4, 0, 2.0]], 24, false), dark, eng)
		Kit.inst(Kit.loft([[2.35, 0.37, 0.37, 0, 2.0], [1.7, 0.34, 0.34, 0, 2.0]], 24, false), Kit.metal(Color(0.03, 0.03, 0.035), 0.6, 1.0), eng)
		Kit.inst(Kit.loft([[1.55, 0.2, 0.2, 0, 2.0], [2.1, 0.02, 0.02, 0, 2.0]], 16), trim, eng)
		for pk in 12:
			var pa := TAU * pk / 12.0
			Kit.inst(Kit.bbox(Vector3(0.2, 0.025, 0.5), 0.008), trim, eng, Vector3(cos(pa) * 0.455, sin(pa) * 0.455, 2.1), Vector3(0, 0, pa + PI / 2))
		var noz := Kit.inst(Kit.cyl(0.3, 0.3, 0.02, 24), Kit.glow(glow_c, 9.0), eng, Vector3(0, 0, 1.6), Vector3(PI / 2, 0, 0)); noz.name = "Nozzle"
		noz.add_to_group("ship_nozzle")
		for r in 3: Kit.inst(_torus(0.6 + 0.012, 0.03), trim, eng, Vector3(0, 0, -1.2 + r * 0.9), Vector3(PI / 2, 0, 0))
		var el := Kit.light(eng, Vector3(0, 0, 2.6), glow_c, 3.0, 9.0); el.name = "EngineLight"; el.add_to_group("ship_engine_light")
		# Intake and tail fin.
		Kit.inst(Kit.hull(PackedVector3Array([Vector3(side * 0.5, 0.9, 2.2), Vector3(side * 0.56, 0.9, 4.2), Vector3(side * 1.25, 2.3, 4.5), Vector3(side * 1.2, 2.3, 3.7), Vector3(side * 0.42, 0.9, 2.2), Vector3(side * 0.48, 0.9, 4.2), Vector3(side * 1.17, 2.3, 4.5), Vector3(side * 1.12, 2.3, 3.7)])), hull_m, root)
	# Landing gear.
	for g in [Vector3(0, -0.5, -3.2), Vector3(-1.6, -0.45, 2.2), Vector3(1.6, -0.45, 2.2)]:
		var leg := Node3D.new(); leg.position = g; leg.name = "Gear"; leg.add_to_group("ship_gear"); root.add_child(leg)
		Kit.inst(Kit.cyl(0.07, 0.09, 0.9, 12), trim, leg, Vector3(0, -0.4, 0))
		Kit.inst(Kit.cyl(0.045, 0.045, 0.8, 10), dark, leg, Vector3(0, -0.3, 0.25), Vector3(0.6, 0, 0))
		Kit.inst(Kit.bbox(Vector3(0.5, 0.1, 0.8), 0.04), dark, leg, Vector3(0, -0.88, 0))
	# Guns under the nose.
	for side in [-1.0, 1.0]:
		Kit.inst(Kit.cyl(0.05, 0.06, 1.6, 12), dark, root, Vector3(side * 0.62, -0.12, -3.6), Vector3(PI / 2, 0, 0))
	# Cockpit interior: seat, console and glowing panels.
	var cp := Node3D.new(); cp.name = "Cockpit"; root.add_child(cp)
	Kit.inst(Kit.bbox(Vector3(1.1, 0.3, 0.5), 0.08), dark, cp, Vector3(0, 0.62, -2.75), Vector3(-0.5, 0, 0))
	Kit.inst(Kit.bbox(Vector3(0.9, 0.2, 0.02), 0.005), Kit.glow(Color(0.3, 0.85, 1.0), 2.2), cp, Vector3(0, 0.7, -2.6), Vector3(-0.5, 0, 0))
	Kit.inst(Kit.bbox(Vector3(0.5, 0.9, 0.14), 0.06), Kit.metal(Color(0.12, 0.1, 0.09), 0.7, 0.0), cp, Vector3(0, 0.75, -0.75), Vector3(0.12, 0, 0))
	Kit.inst(Kit.bbox(Vector3(0.5, 0.12, 0.5), 0.05), Kit.metal(Color(0.12, 0.1, 0.09), 0.7, 0.0), cp, Vector3(0, 0.42, -1.05))
	var cl := Kit.light(cp, Vector3(0, 0.95, -2.2), Color(0.4, 0.8, 1.0), 0.5, 3.0)
	return root

static func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new(); s.radius = r; s.height = r * 2.0; s.radial_segments = 16; s.rings = 8
	return s

static func _torus(r: float, t: float) -> TorusMesh:
	var m := TorusMesh.new(); m.inner_radius = r - t; m.outer_radius = r + t; m.rings = 32; m.ring_segments = 8
	return m
