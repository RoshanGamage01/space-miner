class_name Kit
## Materials and mesh builders shared by ships, buildings and tools.

static var _mats := {}

## Scanned PBR material, projected so procedural shapes need no UVs.
static func pbr(tex: String, scale := 0.5, tint := Color.WHITE, metallic := 0.0, world := false, rough := 1.0) -> StandardMaterial3D:
	var key := "%s|%s|%s|%s|%s|%s" % [tex, scale, tint, metallic, world, rough]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_texture = Biomes.tex(tex, "diff"); m.albedo_color = tint
	m.normal_enabled = true; m.normal_texture = Biomes.tex(tex, "nor")
	var arm := Biomes.tex(tex, "arm")
	m.roughness_texture = arm; m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN; m.roughness = rough
	m.ao_enabled = true; m.ao_texture = arm; m.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	m.metallic = metallic
	if metallic > 0.0: m.metallic_texture = arm; m.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE; m.metallic = 1.0
	m.uv1_triplanar = true; m.uv1_world_triplanar = world; m.uv1_scale = Vector3.ONE * scale; m.uv1_triplanar_sharpness = 4.0
	_mats[key] = m
	return m

## Smooth painted or bare metal with fine panel detail.
static func metal(tint: Color, rough := 0.35, metallic := 1.0, scale := 0.6) -> StandardMaterial3D:
	var key := "metal|%s|%s|%s|%s" % [tint, rough, metallic, scale]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = tint; m.metallic = metallic; m.roughness = rough
	# Subtle brushed variation instead of a pattern: scanned concrete roughness, faint.
	var arm := Biomes.tex("painted_concrete", "arm")
	m.roughness_texture = arm; m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN; m.roughness = rough * 1.25
	m.normal_enabled = true; m.normal_texture = Biomes.tex("painted_concrete", "nor"); m.normal_scale = 0.12
	m.uv1_triplanar = true; m.uv1_scale = Vector3.ONE * scale * 0.35; m.uv1_triplanar_sharpness = 4.0
	m.clearcoat_enabled = metallic < 0.9; m.clearcoat = 0.6; m.clearcoat_roughness = 0.2
	_mats[key] = m
	return m

static func glow(color: Color, energy := 4.0) -> StandardMaterial3D:
	var key := "glow|%s|%s" % [color, energy]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color * 0.2; m.emission_enabled = true; m.emission = color; m.emission_energy_multiplier = energy
	m.roughness = 0.3
	_mats[key] = m
	return m

static func glass(tint := Color(0.05, 0.09, 0.12), alpha := 0.35) -> StandardMaterial3D:
	var key := "glass|%s|%s" % [tint, alpha]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(tint.r, tint.g, tint.b, alpha); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.metallic = 0.9; m.roughness = 0.04; m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.clearcoat_enabled = true; m.rim_enabled = true; m.rim = 0.4
	_mats[key] = m
	return m

static var _dot: GradientTexture2D

## Soft additive particle sprite.
static func spark_mat(color: Color, energy := 4.0) -> StandardMaterial3D:
	var key := "spark|%s|%s" % [color, energy]
	if _mats.has(key): return _mats[key]
	if _dot == null:
		var g := Gradient.new(); g.set_color(0, Color(1, 1, 1, 1)); g.set_color(1, Color(1, 1, 1, 0)); g.add_point(0.35, Color(1, 1, 1, 0.5))
		_dot = GradientTexture2D.new(); _dot.gradient = g; _dot.fill = GradientTexture2D.FILL_RADIAL
		_dot.fill_from = Vector2(0.5, 0.5); _dot.fill_to = Vector2(1.0, 0.5); _dot.width = 64; _dot.height = 64
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES; m.billboard_keep_scale = true
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_texture = _dot; m.albedo_color = Color(color.r * energy, color.g * energy, color.b * energy, 1.0)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED; m.no_depth_test = false; m.disable_receive_shadows = true
	_mats[key] = m
	return m

static func inst(mesh: Mesh, mat: Material, parent: Node3D, pos := Vector3.ZERO, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = mat
	mi.position = pos; mi.rotation = rot; mi.scale = scl
	parent.add_child(mi)
	return mi

## Box with chamfered edges so highlights catch the corners.
static func bbox(size: Vector3, bevel := 0.06) -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var h := size * 0.5; var b := minf(bevel, minf(h.x, minf(h.y, h.z)) * 0.9)
	var pts: Array = []
	for sx in [-1, 1]:
		for sy in [-1, 1]:
			for sz in [-1, 1]:
				var c := Vector3(sx * h.x, sy * h.y, sz * h.z)
				pts.append([c - Vector3(sx * b, 0, 0) * 0.0 - Vector3(0, sy * b, 0) - Vector3(0, 0, sz * b), c - Vector3(sx * b, 0, 0) - Vector3(0, 0, sz * b), c - Vector3(sx * b, 0, 0) - Vector3(0, sy * b, 0)])
	# Build as convex hull of the 24 chamfer points.
	var all := PackedVector3Array()
	for p in pts: for q in p: all.append(q)
	return hull(all)

static func hull(points: PackedVector3Array) -> ArrayMesh:
	var shape := ConvexPolygonShape3D.new(); shape.points = points
	var dm := shape.get_debug_mesh()
	# Debug mesh is lines; rebuild triangles with flat normals via Geometry3D.
	var planes := Geometry3D.compute_convex_mesh_points(_planes(points))
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var pl := _planes(points)
	for plane in pl:
		var face: Array = []
		for p in planes: if absf(plane.distance_to(p)) < 0.0005: face.append(p)
		if face.size() < 3: continue
		var c := Vector3.ZERO
		for p in face: c += p
		c /= face.size()
		var u: Vector3 = (face[0] - c).normalized(); var v := plane.normal.cross(u)
		face.sort_custom(func(a, b2): return atan2((a - c).dot(v), (a - c).dot(u)) < atan2((b2 - c).dot(v), (b2 - c).dot(u)))
		for i in range(1, face.size() - 1):
			for q in [face[0], face[i + 1], face[i]]:
				st.set_normal(plane.normal); st.add_vertex(q)
	return st.commit()

static func _planes(points: PackedVector3Array) -> Array[Plane]:
	var out: Array[Plane] = []
	var n := points.size()
	for i in n:
		for j in range(i + 1, n):
			for k in range(j + 1, n):
				var pl := Plane(points[i], points[j], points[k])
				if pl.normal.length() < 0.5: continue
				var pos := 0; var neg := 0
				for p in points:
					var d := pl.distance_to(p)
					if d > 0.0005: pos += 1
					elif d < -0.0005: neg += 1
				if pos > 0 and neg > 0: continue
				if pos > 0: pl = Plane(-pl.normal, -pl.d)
				var dup := false
				for o in out: if o.normal.dot(pl.normal) > 0.9999 and absf(o.d - pl.d) < 0.0005: dup = true
				if not dup: out.append(pl)
	return out

## Lofted body along -Z..+Z. sections: [z, half_width, half_height, y, exponent].
static func loft(sections: Array, sides := 28, cap := true) -> ArrayMesh:
	var v := PackedVector3Array(); var n := PackedVector3Array(); var idx := PackedInt32Array()
	var ns := sections.size()
	for si in ns:
		var s: Array = sections[si]
		var e: float = s[4] if s.size() > 4 else 2.0
		for k in sides:
			var a := TAU * k / sides
			var cx := cos(a); var sy := sin(a)
			var px: float = signf(cx) * pow(absf(cx), 2.0 / e) * s[1]
			var py: float = signf(sy) * pow(absf(sy), 2.0 / e) * s[2] + s[3]
			v.append(Vector3(px, py, s[0]))
			n.append(Vector3.ZERO)
	for si in ns - 1:
		for k in sides:
			var a := si * sides + k; var b := si * sides + (k + 1) % sides
			var c := a + sides; var d := b + sides
			idx.append_array([a, c, b, b, c, d])
	if cap:
		for end in [0, ns - 1]:
			var ci := v.size(); var s: Array = sections[end]
			v.append(Vector3(0, s[3], s[0])); n.append(Vector3.ZERO)
			for k in sides:
				var a: int = end * sides + k; var b: int = end * sides + (k + 1) % sides
				if end == 0: idx.append_array([ci, a, b])
				else: idx.append_array([ci, b, a])
	for i in range(0, idx.size(), 3):
		var fn := (v[idx[i + 1]] - v[idx[i]]).cross(v[idx[i + 2]] - v[idx[i]])
		for j in 3: n[idx[i + j]] += fn
	for i in n.size(): n[i] = -n[i].normalized()
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v; arr[Mesh.ARRAY_NORMAL] = n; arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

static func cyl(r_top: float, r_bot: float, height: float, sides := 24) -> CylinderMesh:
	var c := CylinderMesh.new(); c.top_radius = r_top; c.bottom_radius = r_bot; c.height = height; c.radial_segments = sides; c.rings = 1
	return c

static func light(parent: Node3D, pos: Vector3, color: Color, energy := 2.0, range_ := 8.0, shadows := false) -> OmniLight3D:
	var l := OmniLight3D.new(); l.position = pos; l.light_color = color; l.light_energy = energy; l.omni_range = range_
	l.shadow_enabled = shadows; l.light_volumetric_fog_energy = 2.0
	l.distance_fade_enabled = true; l.distance_fade_begin = 120.0; l.distance_fade_length = 40.0
	parent.add_child(l)
	return l

## Drop a scanned prop (all meshes of the model) with a uniform scale.
static func prop(name: String, parent: Node3D, pos := Vector3.ZERO, yaw := 0.0, scale := 1.0) -> Node3D:
	var scene: PackedScene = load("res://assets/models/%s/%s.gltf" % [name, name])
	if scene == null: return null
	var n: Node3D = scene.instantiate()
	n.position = pos; n.rotation.y = yaw; n.scale = Vector3.ONE * scale
	parent.add_child(n)
	return n
