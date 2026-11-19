class_name TreeGen
## Grows a tree mesh: bark tubes plus leaf cards cut from scanned foliage.

const TR := "res://assets/trees/"
const SPECIES := {
	"broadleaf": {"bark": "island_tree_01/island_tree_01", "leaf": "broadleaf", "h": [9.0, 14.0], "r": 0.34, "first": 0.3, "n1": 12, "n2": 5, "spread": 1.05, "droop": -0.1, "card": 2.5, "len1": 0.55, "tint": Color(0.62, 0.72, 0.5)},
	"broadleaf2": {"bark": "tree_small_02/tree_small_02", "leaf": "broadleaf2", "h": [6.0, 10.0], "r": 0.24, "first": 0.28, "n1": 11, "n2": 5, "spread": 1.2, "droop": 0.0, "card": 2.3, "len1": 0.6, "tint": Color(0.6, 0.72, 0.55)},
	"jacaranda": {"bark": "jacaranda_tree/jacaranda_tree_trunk", "leaf": "jacaranda", "h": [8.0, 12.0], "r": 0.36, "first": 0.35, "n1": 8, "n2": 4, "spread": 1.25, "droop": 0.05, "card": 2.8, "len1": 0.7, "tint": Color(1.25, 0.6, 1.2)},
	"pine": {"bark": "pine_tree_01/pine_tree_01_bark", "leaf": "pine", "h": [15.0, 24.0], "r": 0.32, "first": 0.3, "n1": 26, "n2": 0, "spread": 1.45, "droop": 0.5, "card": 3.4, "len1": 0.26, "conifer": true, "tint": Color(0.55, 0.72, 0.5)},
	"fir": {"bark": "fir_tree_01/fir_tree_01_bark", "leaf": "fir", "h": [12.0, 20.0], "r": 0.3, "first": 0.16, "n1": 30, "n2": 0, "spread": 1.5, "droop": 0.6, "card": 3.0, "len1": 0.24, "conifer": true, "tint": Color(0.5, 0.68, 0.52)},
	"dead": {"bark": "pine_tree_01/pine_tree_01_bark", "leaf": "", "h": [6.0, 11.0], "r": 0.3, "first": 0.4, "n1": 6, "n2": 3, "spread": 0.9, "droop": -0.1, "card": 0.0, "len1": 0.5, "tint": Color(0.4, 0.36, 0.34)},
}

var rnd := RandomNumberGenerator.new()
var bv := PackedVector3Array(); var bn := PackedVector3Array(); var bu := PackedVector2Array(); var bc := PackedColorArray(); var bi := PackedInt32Array()
var lv := PackedVector3Array(); var ln := PackedVector3Array(); var lu := PackedVector2Array(); var lc := PackedColorArray(); var li := PackedInt32Array()
var sp: Dictionary
var height := 10.0
var crown := Vector3.ZERO
var lod := 0
var tips: Array = []

static var _mats := {}

static func bark_material(species: String) -> Material:
	var key := "bark:" + species
	if _mats.has(key): return _mats[key]
	var s: Dictionary = SPECIES[species]
	var m := StandardMaterial3D.new()
	m.albedo_texture = load(TR + s.bark + "_diff_1k.jpg")
	m.normal_enabled = true; m.normal_texture = load(TR + s.bark + "_nor_gl_1k.jpg")
	m.orm_texture = load(TR + s.bark + "_arm_1k.jpg") if false else null
	m.roughness_texture = load(TR + s.bark + "_arm_1k.jpg"); m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	m.ao_enabled = true; m.ao_texture = m.roughness_texture; m.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	if species == "dead": m.albedo_color = Color(0.55, 0.5, 0.48)
	m.vertex_color_use_as_albedo = false
	_mats[key] = m
	return m

static func leaf_material(species: String) -> Material:
	var key := "leaf:" + species
	if _mats.has(key): return _mats[key]
	var s: Dictionary = SPECIES[species]
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/foliage.gdshader")
	m.set_shader_parameter("alb", load("res://assets/foliage/" + s.leaf + ".png"))
	m.set_shader_parameter("tint", s.tint)
	m.set_shader_parameter("sphere_normals", 1.0)
	m.set_shader_parameter("cutoff", 0.35)
	_mats[key] = m
	return m

## Returns an ArrayMesh (surface 0 bark, surface 1 leaves when present).
static func make(species: String, seed_: int, lod_ := 0) -> Dictionary:
	var g := TreeGen.new()
	g.sp = SPECIES[species]; g.rnd.seed = seed_; g.lod = lod_
	g.height = g.rnd.randf_range(g.sp.h[0], g.sp.h[1])
	g.crown = Vector3(0, g.height * 0.68, 0)
	g._tree()
	var mesh := ArrayMesh.new()
	var a := []; a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = g.bv; a[Mesh.ARRAY_NORMAL] = g.bn; a[Mesh.ARRAY_TEX_UV] = g.bu; a[Mesh.ARRAY_COLOR] = g.bc; a[Mesh.ARRAY_INDEX] = g.bi
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	mesh.surface_set_material(0, bark_material(species))
	if g.lv.size() > 0:
		var b := []; b.resize(Mesh.ARRAY_MAX)
		b[Mesh.ARRAY_VERTEX] = g.lv; b[Mesh.ARRAY_NORMAL] = g.ln; b[Mesh.ARRAY_TEX_UV] = g.lu; b[Mesh.ARRAY_COLOR] = g.lc; b[Mesh.ARRAY_INDEX] = g.li
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, b)
		mesh.surface_set_material(1, leaf_material(species))
	return {"mesh": mesh, "height": g.height, "radius": g.sp.r * g.height / 10.0}

func _tree() -> void:
	var r0: float = sp.r * height / 10.0
	var conifer: bool = sp.get("conifer", false)
	var lean := Vector3(rnd.randf_range(-0.12, 0.12), 1, rnd.randf_range(-0.12, 0.12)).normalized()
	var path := _path(Vector3(0, -0.4, 0), lean, height + 0.4, 9 if lod == 0 else 5, 0.05 if conifer else 0.14, 0.0)
	_tube(path, r0, 0.04 if conifer else r0 * 0.22, 10 if lod == 0 else 6, true)
	var n1: int = sp.n1 if lod == 0 else int(sp.n1 * 0.6)
	for k in n1:
		var t := lerpf(sp.first, 0.96, (k + rnd.randf() * 0.6) / n1)
		var p := _at(path, t)
		var yaw := k * 2.399 + rnd.randf_range(-0.4, 0.4)
		var out := Vector3(cos(yaw), 0, sin(yaw))
		var up_amt := lerpf(0.25, 1.1, t) if not conifer else lerpf(-0.12, 0.35, t)
		var dir: Vector3 = (out * sp.spread + Vector3.UP * up_amt).normalized()
		var blen: float = height * sp.len1 * (lerpf(1.0, 0.18, t) if conifer else lerpf(1.0, 0.55, t * t)) * rnd.randf_range(0.8, 1.15)
		var br := r0 * lerpf(0.42, 0.14, t)
		var bp := _path(p, dir, blen, 5 if lod == 0 else 3, 0.22, sp.droop)
		_tube(bp, br, 0.02, 6 if lod == 0 else 4, false)
		if conifer:
			var cards := 3 if lod == 0 else 1
			for c in cards:
				var ct := (c + 0.6) / cards
				_card(_at(bp, ct * 0.55), (_at(bp, 1.0) - _at(bp, ct * 0.5)).normalized(), sp.card * lerpf(1.25, 0.5, t) * lerpf(1.0, 0.75, ct), true)
		else:
			var n2: int = sp.n2 if lod == 0 else 2
			for j in n2:
				var t2 := lerpf(0.35, 1.0, (j + rnd.randf()) / n2)
				var q := _at(bp, t2)
				var d2: Vector3 = (dir.rotated(Vector3.UP, rnd.randf_range(-1.1, 1.1)) + Vector3.UP * rnd.randf_range(0.1, 0.7)).normalized()
				var p2 := _path(q, d2, blen * 0.5 * rnd.randf_range(0.7, 1.1), 3, 0.25, sp.droop)
				_tube(p2, br * 0.45, 0.015, 4, false)
				tips.append([_at(p2, 1.0), d2]); tips.append([_at(p2, 0.5), (d2 + Vector3.UP * 0.5).normalized()])
			tips.append([_at(bp, 1.0), dir])
	if not conifer and sp.card > 0.0:
		tips.append([_at(path, 1.0), Vector3.UP])
		for tp in tips:
			_card(tp[0], tp[1], sp.card * rnd.randf_range(0.8, 1.25), false)
			if lod == 0:
				_card(tp[0], (tp[1].rotated(Vector3.UP, 1.7) + Vector3(rnd.randf_range(-0.6, 0.6), rnd.randf_range(-0.3, 0.6), rnd.randf_range(-0.6, 0.6))).normalized(), sp.card * rnd.randf_range(0.7, 1.1), false)

func _path(o: Vector3, dir: Vector3, length: float, segs: int, wobble: float, droop: float) -> Array:
	var pts := [o]; var d := dir; var p := o
	for i in segs:
		d = (d + Vector3(rnd.randf_range(-1, 1), rnd.randf_range(-0.5, 1), rnd.randf_range(-1, 1)) * wobble + Vector3.DOWN * droop * 0.25 * (float(i) / segs)).normalized()
		p += d * length / segs
		pts.append(p)
	return pts

func _at(path: Array, t: float) -> Vector3:
	var f := clampf(t, 0, 1) * (path.size() - 1)
	var i := mini(int(f), path.size() - 2)
	return path[i].lerp(path[i + 1], f - i)

func _tube(path: Array, r0: float, r1: float, sides: int, flare: bool) -> void:
	var base := bv.size()
	var n := path.size()
	var vlen := 0.0
	for i in n:
		var t := float(i) / (n - 1)
		var d: Vector3 = (path[mini(i + 1, n - 1)] - path[maxi(i - 1, 0)]).normalized()
		var side := d.cross(Vector3.RIGHT if absf(d.x) < 0.9 else Vector3.FORWARD).normalized()
		var fw := d.cross(side)
		var r := lerpf(r0, r1, pow(t, 0.8))
		if flare and i == 0: r *= 1.55
		if flare and i == 1: r *= 1.12
		if i > 0: vlen += path[i].distance_to(path[i - 1])
		for s in sides + 1:
			var a := TAU * s / sides
			var nrm := side * cos(a) + fw * sin(a)
			bv.append(path[i] + nrm * r); bn.append(nrm)
			bu.append(Vector2(float(s) / sides * maxf(1.0, roundf(r0 * 5.0)), vlen * 0.45))
			var hh: float = clampf(path[i].y / height, 0, 1)
			bc.append(Color(hh * hh * 0.6, 0, 1))
	for i in n - 1:
		for s in sides:
			var a := base + i * (sides + 1) + s; var b := a + sides + 1
			bi.append_array([a, b, a + 1, a + 1, b, b + 1])

func _card(p: Vector3, d: Vector3, size: float, flat: bool) -> void:
	var side := d.cross(Vector3.UP)
	if side.length() < 0.05: side = Vector3.RIGHT
	side = side.normalized()
	var up2 := side.cross(d).normalized()
	var planes := [[side, up2]] if flat else [[side, up2], [up2, side]]
	for pl in planes:
		var s: Vector3 = pl[0]; var nn: Vector3 = pl[1]
		var base := lv.size()
		var bend := (Vector3.DOWN * 0.22 if flat else nn * 0.12) * size
		for row in 3:
			var v := row / 2.0
			for col in 2:
				var u := float(col)
				var pos := p + d * size * v + s * (u - 0.5) * size + bend * v * v - d * size * 0.04
				lv.append(pos)
				var sn := (pos - crown).normalized()
				ln.append((sn * 0.75 + Vector3.UP * 0.45 + (nn if nn.y > 0 else -nn) * 0.25).normalized())
				lu.append(Vector2(u, 1.0 - v))
				var hh := clampf(pos.y / height, 0, 1)
				var depth := clampf((pos - crown).length() / (height * 0.45), 0.0, 1.0)
				lc.append(Color(hh * hh * 0.6 + v * 0.25, v, lerpf(0.35, 1.0, depth)))
		for row in 2:
			var a := base + row * 2
			li.append_array([a, a + 2, a + 1, a + 1, a + 2, a + 3])
