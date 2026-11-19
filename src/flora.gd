class_name Flora extends Node3D
## Scatters grass, plants, rocks and trees around the viewer. Placement is a
## pure function of position and seed, so the world is the same every visit.

const CELL := 48.0
const BIG := 192.0
const MODELS := "res://assets/models/"

var hf: Heightfield
var biome: Dictionary
var seed_: int
var quality := 2
var cells := {}
var bigs := {}
var trees: Array = [] # {mesh0, mesh1, height, radius}
var rocks: Array = [] # {mesh, radius, shape}
var plants: Array = [] # {mesh, mat}
var grass_mesh: ArrayMesh
var grass_far: ArrayMesh
var grass_mat: ShaderMaterial
var pending := 0
var removed := {} # id -> true (mined out)
var _mutex := Mutex.new()
var _done: Array = []
var _mat_cache := {}

func _init(h: Heightfield, b: Dictionary, s: int, q := 2) -> void:
	hf = h; biome = b; seed_ = s; quality = q
	var i := 0
	for sp in b.trees:
		if sp == "quiver":
			for m in _model_meshes("quiver_tree_02"):
				trees.append({"mesh0": m.mesh, "mesh1": m.mesh, "height": 7.0, "radius": 0.5, "scale": 5.0, "species": sp})
			continue
		for v in 3:
			var t0 := TreeGen.make(sp, s * 31 + i * 7 + v, 0)
			var t1 := TreeGen.make(sp, s * 31 + i * 7 + v, 1)
			trees.append({"mesh0": t0.mesh, "mesh1": t1.mesh, "height": t0.height, "radius": t0.radius, "scale": 1.0, "species": sp})
		i += 1
	for name in b.rocks:
		for m in _model_meshes(name):
			var r: float = m.mesh.get_aabb().size.length() * 0.35
			rocks.append({"mesh": m.mesh, "radius": r, "shape": m.mesh.create_convex_shape(true, true)})
	for name in b.plants:
		for m in _model_meshes(name):
			plants.append({"mesh": m.mesh, "mat": _foliage_mat(m.mesh), "h": m.mesh.get_aabb().size.y})
	_make_grass()

func _model_meshes(name: String) -> Array:
	var out := []
	var scene: PackedScene = load(MODELS + name + "/" + name + ".gltf")
	if scene == null: return out
	var root := scene.instantiate()
	var stack := [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D and n.mesh != null: out.append({"mesh": n.mesh, "name": n.name})
		for c in n.get_children(): stack.append(c)
	root.free()
	return out

func _foliage_mat(mesh: Mesh) -> Material:
	var src := mesh.surface_get_material(0) as BaseMaterial3D
	if src == null: return null
	if _mat_cache.has(src): return _mat_cache[src]
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/foliage.gdshader")
	m.set_shader_parameter("alb", src.albedo_texture)
	if src.normal_texture: m.set_shader_parameter("nor", src.normal_texture); m.set_shader_parameter("use_nor", 1.0)
	m.set_shader_parameter("cutoff", 0.0)
	m.set_shader_parameter("height_wind", maxf(mesh.get_aabb().size.y, 0.2))
	m.set_shader_parameter("tint", Color(1, 1, 1).lerp(biome.grass_col * 2.0, 0.35))
	m.set_shader_parameter("translucency", 0.45)
	_mat_cache[src] = m
	return m

func _blades(blades: int, segs: int, wmul: float, seed2: int) -> ArrayMesh:
	var rnd := RandomNumberGenerator.new(); rnd.seed = seed2
	var v := PackedVector3Array(); var n := PackedVector3Array(); var uv := PackedVector2Array(); var idx := PackedInt32Array()
	for b in blades:
		var a := rnd.randf() * TAU
		var o := Vector3(cos(a), 0, sin(a)) * sqrt(rnd.randf()) * 0.34
		var face := rnd.randf() * TAU
		var side := Vector3(cos(face), 0, sin(face)); var fw := Vector3(-sin(face), 0, cos(face))
		var hh := rnd.randf_range(0.28, 0.78) * (1.0 if rnd.randf() > 0.12 else 1.5); var w := rnd.randf_range(0.011, 0.02) * wmul; var lean := rnd.randf_range(0.04, 0.4) * hh
		var base := v.size()
		for s in segs + 1:
			var t := float(s) / segs
			var c := o + Vector3(0, hh * t, 0) + fw * lean * t * t
			var ww := w * (1.0 - pow(t, 1.6) * 0.95)
			v.append(c - side * ww); v.append(c + side * ww)
			var nn := (fw * -1.0 + Vector3(0, lean * 2.0 * t, 0)).normalized()
			n.append(nn); n.append(nn)
			uv.append(Vector2(0, t)); uv.append(Vector2(1, t))
		for s in segs:
			var q := base + s * 2
			idx.append_array([q, q + 2, q + 1, q + 1, q + 2, q + 3])
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v; arr[Mesh.ARRAY_NORMAL] = n; arr[Mesh.ARRAY_TEX_UV] = uv; arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

func _make_grass() -> void:
	grass_mesh = _blades(11, 3, 1.0, 99)
	grass_far = _blades(5, 2, 2.6, 98)
	grass_mat = ShaderMaterial.new(); grass_mat.shader = load("res://shaders/grass.gdshader")
	var gc: Color = biome.grass_col
	grass_mat.set_shader_parameter("tip_col", gc)
	grass_mat.set_shader_parameter("base_col", gc * 0.22)
	grass_mat.set_shader_parameter("dry_col", gc.lerp(Color(0.7, 0.62, 0.3), 0.55))
	var nt := NoiseTexture2D.new(); var fn := FastNoiseLite.new(); fn.frequency = 0.02; fn.fractal_octaves = 3
	nt.noise = fn; nt.seamless = true; nt.generate_mipmaps = true
	grass_mat.set_shader_parameter("noise_tex", nt)
	grass_mesh.surface_set_material(0, grass_mat); grass_far.surface_set_material(0, grass_mat)

func update(cam: Vector3) -> void:
	_mutex.lock(); var done := _done; _done = []; _mutex.unlock()
	for d in done: _finish(d)
	_ring(cells, cam, CELL, 2 if quality >= 1 else 1, false)
	_ring(bigs, cam, BIG, 5 if quality >= 2 else 3, true)

func _ring(map: Dictionary, cam: Vector3, size: float, radius: int, big: bool) -> void:
	var cx := floori(cam.x / size); var cz := floori(cam.z / size)
	for key in map.keys():
		if absi(key.x - cx) > radius + 1 or absi(key.y - cz) > radius + 1:
			var c: Dictionary = map[key]
			c.dead = true
			if c.node: c.node.queue_free()
			map.erase(key)
	for dz in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			var key := Vector2i(cx + dx, cz + dz)
			if map.has(key):
				if big: _colliders(map[key], maxi(absi(dx), absi(dz)) <= 1)
				continue
			var c := {"key": key, "node": null, "dead": false, "big": big, "near": maxi(absi(dx), absi(dz)) <= 1, "bodies": null, "data": null}
			map[key] = c; pending += 1
			WorkerThreadPool.add_task(_gen_big.bind(c) if big else _gen_cell.bind(c))

func _hash(a: int, b: int, c: int) -> int:
	return hash(Vector4i(a, b, c, seed_))

func _gen_cell(c: Dictionary) -> void:
	var key: Vector2i = c.key
	var rnd := RandomNumberGenerator.new(); rnd.seed = _hash(key.x, key.y, 1)
	var ox := key.x * CELL; var oz := key.y * CELL
	# Height grid for fast lookups.
	var gn := 25; var gs := CELL / (gn - 1)
	var hs := PackedFloat32Array(); hs.resize(gn * gn)
	for j in gn:
		for i in gn: hs[j * gn + i] = hf.height(ox + i * gs, oz + j * gs)
	var out := {"grass": PackedFloat32Array(), "plants": [], "rocks": []}
	var dens: float = biome.grass * (3.0 if c.near else 1.1) * (1.0 if quality >= 2 else 0.5)
	var count := int(CELL * CELL * dens)
	var g := PackedFloat32Array(); g.resize(count * 12); var k := 0
	for i in count:
		var x := rnd.randf() * CELL; var z := rnd.randf() * CELL
		var fx := x / gs; var fz := z / gs; var ix := mini(int(fx), gn - 2); var iz := mini(int(fz), gn - 2)
		var tx := fx - ix; var tz := fz - iz
		var h00 := hs[iz * gn + ix]; var h10 := hs[iz * gn + ix + 1]; var h01 := hs[(iz + 1) * gn + ix]; var h11 := hs[(iz + 1) * gn + ix + 1]
		var h := lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)
		var slope := (absf(h10 - h00) + absf(h01 - h00)) / gs
		if h < hf.sea + 4.5 + rnd.randf() * 2.0 or slope > 0.62 or h > hf.sea + biome.snow_line - 20.0: continue
		if hf.in_site(ox + x, oz + z, 0.92): continue
		var a := rnd.randf() * TAU; var s := rnd.randf_range(0.6, 1.15) * (1.0 if c.near else 1.4)
		var ca := cos(a) * s; var sa := sin(a) * s
		g[k] = ca; g[k + 1] = 0; g[k + 2] = sa; g[k + 3] = x
		g[k + 4] = 0; g[k + 5] = s; g[k + 6] = 0; g[k + 7] = h
		g[k + 8] = -sa; g[k + 9] = 0; g[k + 10] = ca; g[k + 11] = z
		k += 12
	g.resize(k); out.grass = g
	if not plants.is_empty():
		var kinds := []
		for i in 4: kinds.append(rnd.randi() % plants.size())
		var np := int(34 * (1.0 if quality >= 2 else 0.5))
		for i in np:
			var x := ox + rnd.randf() * CELL; var z := oz + rnd.randf() * CELL
			var h := hf.height(x, z)
			if h < hf.sea + 1.5 or hf.in_site(x, z) or hf.normal(x, z).y < 0.8: continue
			if rnd.randf() > 0.25 + hf.forest(x, z) * 0.75: continue
			var kind: int = kinds[rnd.randi() % 4]
			var sc := rnd.randf_range(0.8, 1.5) * (2.2 if plants[kind].h < 0.3 else 1.0)
			out.plants.append([kind, Transform3D(Basis(Vector3.UP, rnd.randf() * TAU).scaled(Vector3.ONE * sc), Vector3(x - ox, h - 0.03, z - oz))])
	if not rocks.is_empty():
		for i in 7:
			var x := ox + rnd.randf() * CELL; var z := oz + rnd.randf() * CELL
			var h := hf.height(x, z)
			if h < hf.sea - 1.0 or hf.in_site(x, z): continue
			var kind := rnd.randi() % rocks.size()
			var sc: float = rnd.randf_range(0.18, 0.5) / maxf(rocks[kind].radius, 0.2)
			var bs := Basis.from_euler(Vector3(rnd.randf() * 0.5, rnd.randf() * TAU, rnd.randf() * 0.5)).scaled(Vector3.ONE * sc)
			out.rocks.append([kind, Transform3D(bs, Vector3(x - ox, h - 0.05, z - oz))])
	_mutex.lock(); _done.append([c, out]); _mutex.unlock()

func _gen_big(c: Dictionary) -> void:
	var key: Vector2i = c.key
	var rnd := RandomNumberGenerator.new(); rnd.seed = _hash(key.x, key.y, 2)
	var ox := key.x * BIG; var oz := key.y * BIG
	var out := {"trees": [], "rocks": []}
	if not trees.is_empty():
		var step := 10.5; var n := int(BIG / step)
		for j in n:
			for i in n:
				var x := ox + (i + rnd.randf()) * step; var z := oz + (j + rnd.randf()) * step
				var r1 := rnd.randf(); var kind := rnd.randi() % trees.size(); var yaw := rnd.randf() * TAU; var sc := rnd.randf_range(0.8, 1.3)
				var f := hf.forest(x, z)
				if r1 > f * 0.62 + 0.012: continue
				var h := hf.height(x, z)
				if h < hf.sea + 2.2 or h > hf.sea + hf.tree_max_h: continue
				if hf.normal(x, z, 2.0).y < 0.84 or hf.in_site(x, z, 1.1): continue
				var id := "t%d_%d_%d" % [key.x, key.y, j * n + i]
				if removed.has(id): continue
				sc *= trees[kind].scale
				out.trees.append([kind, Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * sc), Vector3(x - ox, h, z - oz)), id])
	if not rocks.is_empty():
		for i in 9:
			var x := ox + rnd.randf() * BIG; var z := oz + rnd.randf() * BIG
			var kind := rnd.randi() % rocks.size()
			var size := rnd.randf_range(1.2, 4.6) * (1.0 + 2.0 * float(rnd.randf() > 0.9))
			var eul := Vector3(rnd.randf() * 0.4, rnd.randf() * TAU, rnd.randf() * 0.4)
			var h := hf.height(x, z)
			if h < hf.sea - 2.0 or hf.in_site(x, z, 1.2): continue
			var id := "r%d_%d_%d" % [key.x, key.y, i]
			if removed.has(id): continue
			var sc: float = size / maxf(rocks[kind].radius, 0.2)
			out.rocks.append([kind, Transform3D(Basis.from_euler(eul).scaled(Vector3.ONE * sc), Vector3(x - ox, h - size * 0.25, z - oz)), id, size])
	_mutex.lock(); _done.append([c, out]); _mutex.unlock()

func _mm(mesh: Mesh, xforms: Array, range_begin := 0.0, range_end := 0.0, shadows := true, mat: Material = null) -> MultiMeshInstance3D:
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size(): mm.set_instance_transform(i, xforms[i])
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm
	if mat: mi.material_override = mat
	mi.visibility_range_begin = range_begin; mi.visibility_range_end = range_end
	if range_end > 0.0: mi.visibility_range_end_margin = 12.0
	if range_begin > 0.0: mi.visibility_range_begin_margin = 12.0
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

func _finish(d: Array) -> void:
	var c: Dictionary = d[0]; var out: Dictionary = d[1]
	pending -= 1
	if c.dead: return
	var node := Node3D.new()
	var size := BIG if c.big else CELL
	node.position = Vector3(c.key.x * size, 0, c.key.y * size)
	c.node = node; c.data = out
	if c.big:
		var by := {}
		for t in out.trees:
			if not by.has(t[0]): by[t[0]] = []
			by[t[0]].append(t[1])
		for kind in by:
			node.add_child(_mm(trees[kind].mesh0, by[kind], 0.0, 300.0))
			node.add_child(_mm(trees[kind].mesh1, by[kind], 300.0, 1500.0, false))
		by = {}
		for r in out.rocks:
			if not by.has(r[0]): by[r[0]] = []
			by[r[0]].append(r[1])
		for kind in by: node.add_child(_mm(rocks[kind].mesh, by[kind], 0.0, 1400.0))
	else:
		var g: PackedFloat32Array = out.grass
		if g.size() > 0:
			var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = grass_mesh if c.near else grass_far
			mm.instance_count = g.size() / 12; mm.buffer = g
			var mi := MultiMeshInstance3D.new(); mi.multimesh = mm
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mi.custom_aabb = AABB(Vector3(0, -400, 0), Vector3(CELL, 1200, CELL))
			node.add_child(mi)
		var by := {}
		for p in out.plants:
			if not by.has(p[0]): by[p[0]] = []
			by[p[0]].append(p[1])
		for kind in by: node.add_child(_mm(plants[kind].mesh, by[kind], 0.0, 130.0, true, plants[kind].mat))
		by = {}
		for r in out.rocks:
			if not by.has(r[0]): by[r[0]] = []
			by[r[0]].append(r[1])
		for kind in by: node.add_child(_mm(rocks[kind].mesh, by[kind], 0.0, 150.0))
	add_child(node)

## Solid bodies for trees and boulders, only near the player.
func _colliders(c: Dictionary, want: bool) -> void:
	if c.node == null: return
	if want and c.bodies == null:
		var holder := Node3D.new(); c.bodies = holder
		for t in c.data.trees:
			var b := StaticBody3D.new(); var cs := CollisionShape3D.new(); var sh := CylinderShape3D.new()
			var tr: Dictionary = trees[t[0]]
			sh.radius = tr.radius * 1.1; sh.height = tr.height * 0.7
			cs.shape = sh; cs.position.y = sh.height * 0.5; b.add_child(cs)
			b.transform = t[1]; b.set_meta("res", {"kind": "tree", "id": t[2], "species": tr.species})
			holder.add_child(b)
		for r in c.data.rocks:
			var b := StaticBody3D.new(); var cs := CollisionShape3D.new()
			cs.shape = rocks[r[0]].shape; b.add_child(cs)
			b.transform = r[1]; b.set_meta("res", {"kind": "rock", "id": r[2], "size": r[3]})
			holder.add_child(b)
		c.node.add_child(holder)
	elif not want and c.bodies != null:
		c.bodies.queue_free(); c.bodies = null
