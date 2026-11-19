class_name Build
## Prefabricated colony architecture, assembled from bevelled shapes with
## scanned concrete and metal materials, plus scanned props.

static func solid(parent: Node3D, size: Vector3, pos: Vector3, yaw := 0.0) -> void:
	var b := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := BoxShape3D.new(); sh.size = size
	cs.shape = sh; b.add_child(cs); b.position = pos; b.rotation.y = yaw; parent.add_child(b)

static func wall_mat(tint := Color(0.92, 0.92, 0.9)) -> Material: return Kit.pbr("concrete_panels", 0.3, tint)
static func floor_mat() -> Material: return Kit.pbr("hangar_concrete_floor", 0.22, Color(0.8, 0.8, 0.8))
static func dark() -> Material: return Kit.metal(Color(0.09, 0.1, 0.12), 0.5, 0.9, 1.0)
static func steel() -> Material: return Kit.metal(Color(0.6, 0.62, 0.66), 0.35, 1.0, 1.0)
static func paint(c: Color) -> Material: return Kit.metal(c, 0.45, 0.1, 1.0)
static func warm() -> Material: return Kit.glow(Color(1.0, 0.8, 0.5), 3.5)

## Habitat module. Front (door) faces +Z.
static func hab(accent: Color, w := 9.0, d := 6.0, floors := 1) -> Node3D:
	var n := Node3D.new()
	var h := 3.4 * floors
	Kit.inst(Kit.bbox(Vector3(w + 0.8, 0.6, d + 0.8), 0.08), floor_mat(), n, Vector3(0, 0.2, 0))
	Kit.inst(Kit.bbox(Vector3(w, h, d), 0.4), wall_mat(), n, Vector3(0, 0.5 + h * 0.5, 0))
	Kit.inst(Kit.bbox(Vector3(w + 0.06, 0.45, d + 0.06), 0.1), paint(accent), n, Vector3(0, 0.5 + h - 0.75, 0))
	Kit.inst(Kit.bbox(Vector3(w + 0.3, 0.28, d + 0.3), 0.08), dark(), n, Vector3(0, 0.5 + h + 0.05, 0))
	Kit.inst(Kit.bbox(Vector3(w + 0.1, 0.5, d + 0.1), 0.1), dark(), n, Vector3(0, 0.72, 0))
	# Door with frame, shutter and light.
	Kit.inst(Kit.bbox(Vector3(2.2, 2.9, 0.3), 0.06), dark(), n, Vector3(0, 1.95, d * 0.5))
	Kit.inst(Kit.bbox(Vector3(1.7, 2.5, 0.12), 0.03), Kit.pbr("painted_metal_shutter", 0.5, accent.lerp(Color.WHITE, 0.5), 1.0), n, Vector3(0, 1.8, d * 0.5 + 0.13))
	Kit.inst(Kit.bbox(Vector3(1.5, 0.08, 0.06), 0.02), warm(), n, Vector3(0, 3.3, d * 0.5 + 0.16))
	Kit.inst(Kit.bbox(Vector3(2.6, 0.24, 1.5), 0.05), floor_mat(), n, Vector3(0, 0.38, d * 0.5 + 0.9))
	Kit.light(n, Vector3(0, 3.0, d * 0.5 + 1.2), Color(1.0, 0.82, 0.55), 2.2, 9.0)
	# Windows.
	for f in floors:
		var y := 2.3 + f * 3.4
		for sx in [-1.0, 1.0]:
			_window(n, Vector3(sx * w * 0.3, y, d * 0.5 + 0.02), 0.0, 1.5)
			_window(n, Vector3(sx * (w * 0.5 + 0.02), y, 0), PI / 2, 2.2)
		_window(n, Vector3(0, y, -d * 0.5 - 0.02), 0.0, 3.0)
	# Roof kit.
	Kit.prop("exterior_aircon_unit", n, Vector3(w * 0.25, 0.5 + h + 0.2, -d * 0.15), 0.4, 1.6)
	Kit.inst(Kit.cyl(0.05, 0.05, 2.6, 8), steel(), n, Vector3(-w * 0.35, 0.5 + h + 1.4, d * 0.2))
	Kit.inst(ShipModel._sphere(0.07), Kit.glow(Color(1, 0.2, 0.15), 6.0), n, Vector3(-w * 0.35, 0.5 + h + 2.75, d * 0.2))
	Kit.inst(Kit.cyl(0.14, 0.14, d * 0.7, 10), steel(), n, Vector3(-w * 0.1, 0.5 + h + 0.34, 0), Vector3(PI / 2, 0, 0))
	solid(n, Vector3(w, h + 0.6, d), Vector3(0, (h + 0.6) * 0.5, 0))
	return n

static func _window(n: Node3D, pos: Vector3, yaw: float, width: float) -> void:
	Kit.inst(Kit.bbox(Vector3(width + 0.24, 1.14, 0.16), 0.04), dark(), n, pos, Vector3(0, yaw, 0))
	Kit.inst(Kit.bbox(Vector3(width, 0.9, 0.2), 0.02), warm(), n, pos, Vector3(0, yaw, 0))
	for i in int(width / 0.75):
		Kit.inst(Kit.bbox(Vector3(0.05, 0.92, 0.24), 0.01), dark(), n, pos + Vector3(cos(yaw), 0, -sin(yaw)) * (-width * 0.5 + (i + 1) * width / (int(width / 0.75) + 1)), Vector3(0, yaw, 0))

## Glass dome with greenery.
static func dome(accent: Color, r := 6.0) -> Node3D:
	var n := Node3D.new()
	Kit.inst(Kit.cyl(r + 0.5, r + 0.7, 0.9, 40), floor_mat(), n, Vector3(0, 0.45, 0))
	Kit.inst(Kit.cyl(r + 0.1, r + 0.1, 0.3, 40), paint(accent), n, Vector3(0, 1.0, 0))
	var sm := SphereMesh.new(); sm.radius = r; sm.height = r; sm.is_hemisphere = true; sm.radial_segments = 40; sm.rings = 14
	Kit.inst(sm, Kit.glass(Color(0.5, 0.75, 0.8), 0.22), n, Vector3(0, 1.1, 0))
	for i in 8:
		var a := TAU * i / 8.0
		var rib := Kit.inst(ShipModel._torus(r, 0.07), steel(), n, Vector3(0, 1.1, 0), Vector3(PI / 2, a, 0))
		rib.scale = Vector3(1, 1, 1)
	Kit.inst(Kit.cyl(r - 0.3, r - 0.3, 0.3, 32), Kit.pbr("brown_mud_leaves_01", 0.4), n, Vector3(0, 1.0, 0))
	for i in 9:
		var a := i * 2.4; var d := 1.0 + (i % 4) * 1.1
		Kit.prop(["fern_02", "shrub_03", "shrub_02"][i % 3], n, Vector3(cos(a) * d, 1.15, sin(a) * d), a, 1.3)
	Kit.light(n, Vector3(0, r * 0.7, 0), Color(0.8, 1.0, 0.85), 2.5, r * 2.2)
	var b := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := CylinderShape3D.new(); sh.radius = r + 0.4; sh.height = r + 1.0
	cs.shape = sh; b.add_child(cs); b.position.y = (r + 1.0) * 0.5; n.add_child(b)
	return n

static func pad(accent: Color, r := 11.0) -> Node3D:
	var n := Node3D.new()
	Kit.inst(Kit.cyl(r, r + 0.5, 0.5, 48), floor_mat(), n, Vector3(0, 0.25, 0))
	Kit.inst(ShipModel._torus(r - 1.2, 0.18), paint(accent), n, Vector3(0, 0.5, 0)).scale.y = 0.15
	Kit.inst(ShipModel._torus(r * 0.45, 0.14), paint(Color(0.95, 0.95, 0.95)), n, Vector3(0, 0.5, 0)).scale.y = 0.15
	for i in 12:
		var a := TAU * i / 12.0
		Kit.inst(Kit.cyl(0.12, 0.15, 0.35, 10), dark(), n, Vector3(cos(a) * (r - 0.4), 0.62, sin(a) * (r - 0.4)))
		Kit.inst(ShipModel._sphere(0.1), Kit.glow(Color(0.4, 0.9, 1.0), 6.0), n, Vector3(cos(a) * (r - 0.4), 0.85, sin(a) * (r - 0.4)))
	return n

static func lamp(n: Node3D, pos: Vector3, yaw := 0.0) -> void:
	Kit.prop("street_lamp_01", n, pos, yaw, 1.5)
	Kit.light(n, pos + Vector3(0, 5.4, 0) + Vector3(sin(yaw), 0, cos(yaw)) * 0.6, Color(1.0, 0.85, 0.6), 3.5, 16.0, true)

static func mast(accent: Color, h := 16.0) -> Node3D:
	var n := Node3D.new()
	Kit.inst(Kit.cyl(1.4, 1.7, 1.2, 20), floor_mat(), n, Vector3(0, 0.6, 0))
	Kit.inst(Kit.cyl(0.16, 0.34, h, 12), steel(), n, Vector3(0, 1.2 + h * 0.5, 0))
	for i in 3: Kit.inst(ShipModel._torus(0.5, 0.05), paint(accent), n, Vector3(0, 4.0 + i * 4.0, 0))
	var dish := SphereMesh.new(); dish.radius = 1.6; dish.height = 0.9; dish.is_hemisphere = true
	Kit.inst(dish, wall_mat(), n, Vector3(0.5, h - 1.0, 0), Vector3(0, 0, -1.9))
	Kit.inst(ShipModel._sphere(0.14), Kit.glow(Color(1, 0.2, 0.15), 8.0), n, Vector3(0, 1.3 + h, 0))
	solid(n, Vector3(2.4, 3.0, 2.4), Vector3(0, 1.5, 0))
	return n

static func stall(accent: Color) -> Node3D:
	var n := Node3D.new()
	Kit.inst(Kit.bbox(Vector3(4.2, 0.12, 3.2), 0.04), paint(accent), n, Vector3(0, 3.0, 0), Vector3(0.12, 0, 0))
	for p in [Vector3(-1.95, 0, -1.4), Vector3(1.95, 0, -1.4), Vector3(-1.95, 0, 1.4), Vector3(1.95, 0, 1.4)]:
		Kit.inst(Kit.cyl(0.05, 0.05, 3.0, 8), steel(), n, p + Vector3(0, 1.5, 0))
	Kit.inst(Kit.bbox(Vector3(3.6, 1.0, 0.9), 0.06), wall_mat(), n, Vector3(0, 0.5, 0.9))
	Kit.inst(Kit.bbox(Vector3(3.7, 0.08, 1.0), 0.03), dark(), n, Vector3(0, 1.04, 0.9))
	Kit.inst(Kit.bbox(Vector3(1.0, 0.5, 0.04), 0.01), Kit.glow(Color(0.4, 0.9, 1.0), 2.5), n, Vector3(1.0, 1.4, 0.9), Vector3(-0.3, 0, 0))
	Kit.prop("old_military_crate", n, Vector3(-1.2, 0, -0.6), 0.3, 1.2)
	Kit.prop("plastic_crate_02", n, Vector3(-0.9, 1.08, 0.9), 0.5, 1.0)
	Kit.prop("Barrel_01", n, Vector3(1.5, 0, -0.9), 0.0, 1.0)
	Kit.prop("barrel_03", n, Vector3(2.5, 0, 0.3), 1.0, 1.0)
	Kit.light(n, Vector3(0, 2.5, 0.6), Color(1.0, 0.85, 0.6), 2.0, 7.0)
	solid(n, Vector3(3.6, 1.1, 0.9), Vector3(0, 0.55, 0.9))
	return n

## The capital's landmark tower.
static func spire(accent: Color, h := 72.0) -> Node3D:
	var n := Node3D.new()
	Kit.inst(Kit.cyl(13.0, 15.0, 5.0, 48), floor_mat(), n, Vector3(0, 2.5, 0))
	Kit.inst(Kit.cyl(10.0, 12.0, 4.0, 48), wall_mat(), n, Vector3(0, 7.0, 0))
	var secs: Array = []
	for i in 12:
		var t := i / 11.0
		secs.append([t * h, lerpf(8.5, 1.2, pow(t, 0.7)) * (1.0 + 0.12 * sin(t * 9.0)), lerpf(8.5, 1.2, pow(t, 0.7)) * (1.0 + 0.12 * sin(t * 9.0)), 0.0, 2.0])
	var body := Kit.inst(Kit.loft(secs, 40), Kit.metal(Color(0.85, 0.86, 0.9), 0.3, 0.8, 0.5), n, Vector3(0, 9.0, 0), Vector3(-PI / 2, 0, 0))
	for i in 7:
		var t := (i + 0.5) / 7.0
		var r := lerpf(8.5, 1.2, pow(t, 0.7)) + 0.5
		Kit.inst(ShipModel._torus(r, 0.22), Kit.glow(accent, 5.0), n, Vector3(0, 9.0 + t * h, 0))
	Kit.inst(Kit.cyl(0.05, 0.3, 14.0, 10), steel(), n, Vector3(0, 9.0 + h + 7.0, 0))
	Kit.inst(ShipModel._sphere(0.7), Kit.glow(accent, 12.0), n, Vector3(0, 9.0 + h + 1.0, 0))
	var l := Kit.light(n, Vector3(0, 9.0 + h + 1.0, 0), accent, 6.0, 120.0); l.distance_fade_enabled = false
	for i in 6:
		var a := TAU * i / 6.0
		Kit.inst(Kit.bbox(Vector3(1.2, 9.0, 5.0), 0.2), wall_mat(), n, Vector3(cos(a) * 10.5, 4.5, sin(a) * 10.5), Vector3(0, -a, 0))
		_window(n, Vector3(cos(a + 0.26) * 10.3, 7.0, sin(a + 0.26) * 10.3), -a - 0.26 + PI / 2, 2.6)
	# Grand door.
	Kit.inst(Kit.bbox(Vector3(4.0, 5.0, 0.6), 0.1), dark(), n, Vector3(0, 2.5, 14.3))
	Kit.inst(Kit.bbox(Vector3(3.2, 4.4, 0.2), 0.04), Kit.glow(accent, 1.5), n, Vector3(0, 2.3, 14.62))
	var b := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := CylinderShape3D.new(); sh.radius = 14.0; sh.height = 30.0
	cs.shape = sh; b.add_child(cs); b.position.y = 15.0; n.add_child(b)
	return n

static func bunker() -> Node3D:
	var n := Node3D.new()
	var rust := Kit.pbr("box_profile_metal_sheet", 0.35, Color(0.75, 0.55, 0.45), 1.0)
	var rust2 := Kit.pbr("rusty_metal_02", 0.3, Color(0.8, 0.7, 0.65), 1.0)
	Kit.inst(Kit.bbox(Vector3(8.0, 3.2, 5.5), 0.12), rust, n, Vector3(0, 1.6, 0))
	Kit.inst(Kit.bbox(Vector3(8.6, 0.3, 6.1), 0.06), rust2, n, Vector3(0, 3.3, 0), Vector3(0.03, 0, 0.02))
	Kit.inst(Kit.bbox(Vector3(3.0, 0.3, 0.1), 0.02), Kit.glow(Color(1.0, 0.25, 0.1), 4.0), n, Vector3(0, 2.3, 2.78))
	Kit.inst(Kit.bbox(Vector3(1.4, 2.2, 0.16), 0.03), rust2, n, Vector3(-2.6, 1.1, 2.8))
	Kit.light(n, Vector3(0, 2.4, 3.6), Color(1.0, 0.35, 0.15), 2.5, 10.0)
	solid(n, Vector3(8.0, 3.4, 5.5), Vector3(0, 1.7, 0))
	return n

static func pylon(accent: Color, h := 9.0) -> Node3D:
	var n := Node3D.new()
	var stone := Kit.pbr("rock_wall_08", 0.25, Color(0.55, 0.55, 0.62))
	Kit.inst(Kit.hull(PackedVector3Array([Vector3(-1.1, 0, -1.1), Vector3(1.1, 0, -1.1), Vector3(1.1, 0, 1.1), Vector3(-1.1, 0, 1.1), Vector3(-0.45, h, -0.45), Vector3(0.45, h, -0.45), Vector3(0.45, h, 0.45), Vector3(-0.45, h, 0.45)])), stone, n)
	Kit.inst(Kit.bbox(Vector3(0.12, h * 0.6, 0.12), 0.02), Kit.glow(accent, 5.0), n, Vector3(0, h * 0.5, 0.82), Vector3(0.07, 0, 0))
	var cr := Kit.inst(Deposit._crystals(5, 1, 2.4, 0.5), Kit.glow(accent, 7.0), n, Vector3(0, h + 0.5, 0))
	Kit.light(n, Vector3(0, h + 1.6, 0), accent, 3.0, 18.0)
	solid(n, Vector3(1.8, h, 1.8), Vector3(0, h * 0.5, 0))
	return n

## The Ancient Gate: a standing ring with a churning portal.
static func gate(accent: Color) -> Node3D:
	var n := Node3D.new()
	var stone := Kit.pbr("rock_wall_08", 0.12, Color(0.4, 0.4, 0.48))
	var metal := Kit.metal(Color(0.16, 0.16, 0.2), 0.3, 1.0, 0.4)
	Kit.inst(Kit.cyl(30.0, 33.0, 2.0, 64), stone, n, Vector3(0, 1.0, 0))
	Kit.inst(Kit.cyl(24.0, 26.0, 1.0, 64), stone, n, Vector3(0, 2.5, 0))
	var R := 19.0
	var ring := TorusMesh.new(); ring.inner_radius = R - 2.2; ring.outer_radius = R + 2.2; ring.rings = 96; ring.ring_segments = 24
	Kit.inst(ring, metal, n, Vector3(0, R + 3.0, 0), Vector3(PI / 2, 0, 0))
	for i in 24:
		var a := TAU * i / 24.0
		var p := Vector3(cos(a) * R, R + 3.0 + sin(a) * R, 0)
		Kit.inst(Kit.bbox(Vector3(1.2, 2.6, 5.0), 0.2), stone if i % 2 == 0 else metal, n, p, Vector3(0, 0, a + PI / 2))
		Kit.inst(Kit.bbox(Vector3(0.25, 1.6, 5.1), 0.05), Kit.glow(accent, 5.0), n, p, Vector3(0, 0, a + PI / 2))
	var disc := MeshInstance3D.new(); var qm := QuadMesh.new(); qm.size = Vector2(R * 2.0 - 3.0, R * 2.0 - 3.0); disc.mesh = qm
	var sm := ShaderMaterial.new(); sm.shader = load("res://shaders/portal.gdshader"); sm.set_shader_parameter("tint", accent)
	disc.material_override = sm; disc.position = Vector3(0, R + 3.0, 0); disc.name = "Portal"; n.add_child(disc)
	var l := Kit.light(n, Vector3(0, R + 3.0, 4.0), accent, 8.0, 70.0); l.distance_fade_enabled = false
	solid(n, Vector3(5.0, 8.0, 5.0), Vector3(-R, 6.0, 0)); solid(n, Vector3(5.0, 8.0, 5.0), Vector3(R, 6.0, 0))
	var b := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := CylinderShape3D.new(); sh.radius = 25.0; sh.height = 3.0
	cs.shape = sh; b.add_child(cs); b.position.y = 1.5; n.add_child(b)
	return n
