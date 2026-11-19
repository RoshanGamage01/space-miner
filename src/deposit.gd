class_name Deposit
## Mineable mineral outcrops: clusters of faceted crystals.

static var _mesh := {}

static func _crystals(seed_: int, count: int, tall: float, wide: float) -> ArrayMesh:
	var rnd := RandomNumberGenerator.new(); rnd.seed = seed_
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for c in count:
		var a := rnd.randf() * TAU; var d := sqrt(rnd.randf()) * 0.55
		var base := Vector3(cos(a) * d, -0.2, sin(a) * d)
		var axis := (Vector3(cos(a) * d * 0.9, 1.0, sin(a) * d * 0.9) + Vector3(rnd.randf_range(-0.25, 0.25), 0, rnd.randf_range(-0.25, 0.25))).normalized()
		var h := tall * rnd.randf_range(0.45, 1.0) * (1.0 - d * 0.6); var r := wide * rnd.randf_range(0.6, 1.0)
		var u := axis.cross(Vector3.RIGHT).normalized(); var w := axis.cross(u)
		var sides := 6; var ring0: Array = []; var ring1: Array = []
		for k in sides:
			var an := TAU * k / sides + rnd.randf() * 0.1
			var o := (u * cos(an) + w * sin(an)) * r
			ring0.append(base + o); ring1.append(base + axis * h * 0.78 + o * 0.82)
		var tip := base + axis * h
		for k in sides:
			var k2 := (k + 1) % sides
			_tri(st, ring0[k], ring1[k], ring0[k2]); _tri(st, ring0[k2], ring1[k], ring1[k2]); _tri(st, ring1[k], tip, ring1[k2])
	return st.commit()

static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	var n := (c - a).cross(b - a).normalized()
	for p in [a, b, c]: st.set_normal(n); st.add_vertex(p)

static func make(item: String) -> Node3D:
	var root := Node3D.new()
	var body := StaticBody3D.new(); root.add_child(body)
	var cs := CollisionShape3D.new(); var sh := SphereShape3D.new(); sh.radius = 0.9; cs.shape = sh; cs.position.y = 0.5; body.add_child(cs)
	if not _mesh.has(item):
		_mesh[item] = _crystals(hash(item), 9 if item != "gold" else 14, 1.9 if item == "aetherium" else (1.2 if item == "copper" else 0.55), 0.2 if item != "gold" else 0.16)
	var mat: Material
	var col: Color = Data.ITEMS[item].color
	if item == "aetherium":
		var m := StandardMaterial3D.new(); m.albedo_color = Color(0.1, 0.5, 0.6); m.roughness = 0.08; m.metallic = 0.2
		m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 2.6; m.rim_enabled = true; m.rim = 1.0
		m.refraction_enabled = false
		mat = m
		Kit.light(root, Vector3(0, 1.0, 0), col, 1.6, 7.0)
	elif item == "gold":
		var m := StandardMaterial3D.new(); m.albedo_color = Color(1.0, 0.76, 0.33); m.metallic = 1.0; m.roughness = 0.22
		mat = m
	else:
		var m := StandardMaterial3D.new(); m.albedo_color = Color(0.9, 0.48, 0.28); m.metallic = 1.0; m.roughness = 0.35
		m.normal_enabled = true; m.normal_texture = Biomes.tex("rusty_metal_02", "nor"); m.uv1_triplanar = true
		mat = m
	Kit.inst(_mesh[item], mat, root)
	# Rocky base so crystals look seated in the ground.
	var rock: PackedScene = load("res://assets/models/boulder_01/boulder_01.gltf")
	if rock:
		var r: Node3D = rock.instantiate(); r.scale = Vector3(0.95, 0.4, 0.95); r.position.y = -0.12; root.add_child(r)
	return root
