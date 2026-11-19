class_name Terrain extends Node3D
## Endless terrain. A quadtree of square patches refines around the viewer;
## patch geometry is built on worker threads from the Heightfield.

const N := 32 # cells per patch edge
const G := N + 3 # samples per edge including the skirt ring
const ROOT := 4096.0
const LEAF := 64.0
const SPLIT := 1.55

var hf: Heightfield
var material: ShaderMaterial
var roots := {}
var pending := 0
var view_roots := 2
var _indices: PackedInt32Array
var _mutex := Mutex.new()
var _done: Array = []

class Patch:
	var x: float; var z: float; var size: float
	var mesh: MeshInstance3D; var kids: Array = []
	var building := false; var dead := false

func _init(h: Heightfield, biome: Dictionary) -> void:
	hf = h
	_indices = PackedInt32Array()
	for b in G - 1:
		for a in G - 1:
			var i := b * G + a
			_indices.append_array([i, i + 1, i + G, i + 1, i + G + 1, i + G])
	material = ShaderMaterial.new()
	material.shader = load("res://shaders/terrain.gdshader")
	for k in [["a", "a"], ["b", "b"], ["rock", "r"], ["c", "c"]]:
		material.set_shader_parameter(k[1] + "_alb", Biomes.tex(biome[k[0]], "diff"))
		material.set_shader_parameter(k[1] + "_nor", Biomes.tex(biome[k[0]], "nor"))
		material.set_shader_parameter(k[1] + "_arm", Biomes.tex(biome[k[0]], "arm"))
	var nt := NoiseTexture2D.new()
	var fn := FastNoiseLite.new(); fn.frequency = 0.012; fn.fractal_octaves = 5
	nt.noise = fn; nt.seamless = true; nt.width = 512; nt.height = 512; nt.generate_mipmaps = true
	material.set_shader_parameter("noise_tex", nt)
	material.set_shader_parameter("tint_a", biome.tint_a)
	material.set_shader_parameter("tint_b", biome.tint_b)
	material.set_shader_parameter("tint_r", biome.tint_rock)
	material.set_shader_parameter("sea", biome.sea)
	material.set_shader_parameter("snow_line", biome.snow_line)
	material.set_shader_parameter("has_water", 0.0 if biome.sea < -100.0 else 1.0)

## Call every frame with the viewer position (world space).
func update(cam: Vector3) -> void:
	_mutex.lock()
	var done := _done; _done = []
	_mutex.unlock()
	for d in done: _finish(d)
	var cx := floori(cam.x / ROOT); var cz := floori(cam.z / ROOT)
	var keep := {}
	for dz in range(-view_roots, view_roots + 1):
		for dx in range(-view_roots, view_roots + 1):
			var key := Vector2i(cx + dx, cz + dz)
			keep[key] = true
			if not roots.has(key):
				var p := Patch.new(); p.x = key.x * ROOT; p.z = key.y * ROOT; p.size = ROOT
				roots[key] = p; _request(p)
	for key in roots.keys():
		if not keep.has(key): _free(roots[key]); roots.erase(key)
	for key in roots: _visit(roots[key], cam)

func ready_near(cam: Vector3) -> bool:
	return pending == 0

func _visit(p: Patch, cam: Vector3) -> void:
	if p.mesh == null: return
	var c := Vector3(p.x + p.size * 0.5, cam.y, p.z + p.size * 0.5)
	var dx := maxf(absf(cam.x - c.x) - p.size * 0.5, 0.0); var dz := maxf(absf(cam.z - c.z) - p.size * 0.5, 0.0)
	var d := sqrt(dx * dx + dz * dz + pow(maxf(cam.y - hf.sea - 400.0, 0.0), 2.0) * 0.3)
	var want := p.size > LEAF and d < p.size * SPLIT
	if want:
		if p.kids.is_empty():
			var h := p.size * 0.5
			for i in 4:
				var k := Patch.new(); k.x = p.x + (i & 1) * h; k.z = p.z + (i >> 1) * h; k.size = h
				p.kids.append(k); _request(k)
		var ok := true
		for k in p.kids: if k.mesh == null: ok = false
		if ok:
			p.mesh.visible = false
			for k in p.kids: _visit(k, cam)
		else:
			p.mesh.visible = true
			for k in p.kids: _hide(k)
	else:
		p.mesh.visible = true
		if not p.kids.is_empty():
			if d > p.size * SPLIT * 1.4:
				for k in p.kids: _free(k)
				p.kids.clear()
			else:
				for k in p.kids: _hide(k)

func _hide(p: Patch) -> void:
	if p.mesh: p.mesh.visible = false
	for k in p.kids: _hide(k)

func _free(p: Patch) -> void:
	p.dead = true
	for k in p.kids: _free(k)
	p.kids.clear()
	if p.mesh: p.mesh.queue_free(); p.mesh = null

func _request(p: Patch) -> void:
	p.building = true; pending += 1
	WorkerThreadPool.add_task(_build.bind(p))

func _build(p: Patch) -> void:
	var step := p.size / N
	var hs := PackedFloat32Array(); hs.resize(G * G)
	var verts := PackedVector3Array(); verts.resize(G * G)
	var nors := PackedVector3Array(); nors.resize(G * G)
	var cols := PackedColorArray(); cols.resize(G * G)
	for b in G:
		for a in G:
			var lx := (a - 1) * step; var lz := (b - 1) * step
			var h := hf.height(p.x + lx, p.z + lz)
			hs[b * G + a] = h
			verts[b * G + a] = Vector3(lx, h, lz)
			var f := hf.forest(p.x + lx, p.z + lz) if (h > hf.sea + 2.0 and h < hf.sea + hf.tree_max_h) else 0.0
			cols[b * G + a] = Color(f, 0, 0)
	for b in range(1, G - 1):
		for a in range(1, G - 1):
			var i := b * G + a
			nors[i] = Vector3(hs[i - 1] - hs[i + 1], 2.0 * step, hs[i - G] - hs[i + G]).normalized()
	var drop := p.size * 0.06 + 1.0
	for b in G:
		for a in G:
			if a > 0 and a < G - 1 and b > 0 and b < G - 1: continue
			var ca := clampi(a, 1, G - 2); var cb := clampi(b, 1, G - 2)
			var s := cb * G + ca
			verts[b * G + a] = verts[s] - Vector3(0, drop, 0)
			nors[b * G + a] = nors[s]
			cols[b * G + a] = cols[s]
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = nors; arr[Mesh.ARRAY_COLOR] = cols; arr[Mesh.ARRAY_INDEX] = _indices
	_mutex.lock(); _done.append([p, arr]); _mutex.unlock()

func _finish(d: Array) -> void:
	var p: Patch = d[0]
	pending -= 1; p.building = false
	if p.dead: return
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, d[1])
	var mi := MeshInstance3D.new()
	mi.mesh = m; mi.material_override = material
	mi.position = Vector3(p.x, 0, p.z)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if p.size <= 512.0 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.visible = false
	mi.gi_mode = GeometryInstance3D.GI_MODE_STATIC
	add_child(mi); p.mesh = mi
