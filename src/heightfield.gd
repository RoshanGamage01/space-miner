class_name Heightfield extends RefCounted
## The shape of a planet's surface. Pure function of (x, z) so the mesh,
## collision, plants and settlements all agree. Thread-safe once built.

var seed_: int
var relief := 1.0
var sea := 0.0
var cont := FastNoiseLite.new()
var hills := FastNoiseLite.new()
var ridge := FastNoiseLite.new()
var detail := FastNoiseLite.new()
var warp := FastNoiseLite.new()
var mask := FastNoiseLite.new()
var veg := FastNoiseLite.new()
var tree_density := 1.0
var tree_max_h := 260.0
var sites: Array = [] # {pos: Vector2, radius: float, h: float}

func _init(s: int, relief_: float, sea_: float) -> void:
	seed_ = s; relief = relief_; sea = sea_
	_mk(cont, s, 1.0 / 5200.0, 5, FastNoiseLite.FRACTAL_FBM)
	_mk(hills, s + 11, 1.0 / 620.0, 5, FastNoiseLite.FRACTAL_FBM)
	_mk(ridge, s + 23, 1.0 / 1900.0, 5, FastNoiseLite.FRACTAL_RIDGED)
	_mk(detail, s + 37, 1.0 / 46.0, 3, FastNoiseLite.FRACTAL_FBM)
	_mk(warp, s + 41, 1.0 / 900.0, 2, FastNoiseLite.FRACTAL_FBM)
	_mk(mask, s + 53, 1.0 / 3600.0, 2, FastNoiseLite.FRACTAL_FBM)
	_mk(veg, s + 67, 1.0 / 380.0, 3, FastNoiseLite.FRACTAL_FBM)

func _mk(n: FastNoiseLite, s: int, f: float, oct: int, fr: int) -> void:
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX
	n.seed = s; n.frequency = f; n.fractal_type = fr; n.fractal_octaves = oct
	n.fractal_lacunarity = 2.05; n.fractal_gain = 0.48

func raw(x: float, z: float) -> float:
	var wx := x + warp.get_noise_2d(x, z) * 260.0
	var wz := z + warp.get_noise_2d(z + 500.0, x - 300.0) * 260.0
	var c := cont.get_noise_2d(wx, wz) # -1..1
	var m := smoothstep(-0.05, 0.45, mask.get_noise_2d(wx, wz) + c * 0.4)
	var r := ridge.get_noise_2d(wx, wz) * 0.5 + 0.5
	var h := c * 95.0 + 22.0
	h += hills.get_noise_2d(wx, wz) * (26.0 + 50.0 * m)
	h += r * r * 520.0 * m
	h += detail.get_noise_2d(x, z) * (1.2 + 3.5 * m)
	return h * relief

func height(x: float, z: float) -> float:
	var h := raw(x, z)
	for s in sites:
		var d: float = Vector2(x, z).distance_to(s.pos)
		if d < s.radius * 2.2:
			var t := 1.0 - smoothstep(s.radius, s.radius * 2.2, d)
			h = lerpf(h, s.h, t)
	return h

func normal(x: float, z: float, e := 1.0) -> Vector3:
	return Vector3(height(x - e, z) - height(x + e, z), 2.0 * e, height(x, z - e) - height(x, z + e)).normalized()

## Find a gently sloped, dry spot near (x, z).
func find_flat(x: float, z: float, rnd: RandomNumberGenerator, min_h := 4.0, max_h := 120.0) -> Vector2:
	var best := Vector2(x, z); var best_s := 1e9
	for i in 140:
		var a := rnd.randf() * TAU; var r := sqrt(rnd.randf()) * (400.0 + i * 22.0)
		var p := Vector2(x + cos(a) * r, z + sin(a) * r)
		var h := raw(p.x, p.y)
		if h < sea + min_h or h > sea + max_h: continue
		var s := 0.0
		for k in 6:
			var q := p + Vector2.from_angle(k * TAU / 6.0) * 45.0
			s += absf(raw(q.x, q.y) - h)
		if s < best_s: best_s = s; best = p
	return best

## 0..1 forest density at a point (before slope and altitude limits).
func forest(x: float, z: float) -> float:
	return smoothstep(-0.08, 0.3, veg.get_noise_2d(x, z)) * tree_density

func in_site(x: float, z: float, pad := 1.15) -> bool:
	for s in sites:
		if Vector2(x, z).distance_to(s.pos) < s.radius * pad: return true
	return false
