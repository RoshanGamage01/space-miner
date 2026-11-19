class_name Sfx extends Node
## Sound: recorded effects where we have them, synthesized tones for the rest,
## looping engine/wind/beam layers, and music.

const RATE := 22050
var streams := {}
var pool: Array = []
var loops := {}
var music := AudioStreamPlayer.new()
var music_track := ""
var next := 0

func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for n in ["jump", "land", "step", "shoot", "hit", "explosion"]:
		streams[n] = load("res://assets/audio/%s.wav" % n)
	streams["door"] = load("res://assets/audio/open_close.wav")
	streams["enemy_shoot"] = load("res://assets/audio/bullet_explode.wav")
	streams["click"] = _tone([[880, 0.04]], 0.5)
	streams["pickup"] = _tone([[660, 0.05], [990, 0.07]], 0.5)
	streams["deny"] = _tone([[160, 0.09], [120, 0.12]], 0.6, true)
	streams["quest"] = _tone([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], 0.5)
	streams["repair"] = _tone([[392, 0.12], [523, 0.12], [784, 0.3]], 0.5)
	streams["heal"] = _tone([[523, 0.08], [784, 0.2]], 0.45)
	streams["death"] = _tone([[330, 0.2], [247, 0.2], [165, 0.5]], 0.6, true)
	streams["alarm"] = _tone([[740, 0.14], [554, 0.14], [740, 0.14], [554, 0.14]], 0.5, true)
	streams["break"] = _noise(0.35, 0.25, 0.6)
	streams["launch"] = _noise(1.6, 0.06, 0.7, true)
	streams["entry"] = _noise(2.2, 0.03, 0.8, true)
	streams["warp"] = _sweep(120.0, 1800.0, 1.8)
	for i in 10:
		var p := AudioStreamPlayer.new(); add_child(p); pool.append(p)
	loops["beam"] = _loop_player(_buzz())
	loops["engine"] = _loop_player(_rumble(0.05))
	loops["wind"] = _loop_player(_rumble(0.3))
	music.volume_db = -16.0; add_child(music)
	set_volume(Game.s.settings.volume)

func _wav(data: PackedFloat32Array, looped := false) -> AudioStreamWAV:
	var bytes := PackedByteArray(); bytes.resize(data.size() * 2)
	for i in data.size(): bytes.encode_s16(i * 2, int(clampf(data[i], -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new(); w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = RATE; w.data = bytes
	if looped: w.loop_mode = AudioStreamWAV.LOOP_FORWARD; w.loop_end = data.size()
	return w

func _tone(notes: Array, vol: float, square := false) -> AudioStreamWAV:
	var d := PackedFloat32Array(); var ph := 0.0
	for n in notes:
		var len := int(n[1] * RATE)
		for i in len:
			ph += TAU * n[0] / RATE
			var env := minf(1.0, i / 200.0) * pow(1.0 - float(i) / len, 1.5)
			var v := sin(ph) + 0.3 * sin(ph * 2.0)
			if square: v = signf(sin(ph)) * 0.5 + sin(ph) * 0.5
			d.append(v * env * vol * 0.6)
	return _wav(d)

func _noise(dur: float, lp: float, vol: float, swell := false) -> AudioStreamWAV:
	var d := PackedFloat32Array(); var y := 0.0; var n := int(dur * RATE)
	var rnd := RandomNumberGenerator.new(); rnd.seed = n
	for i in n:
		y += (rnd.randf_range(-1, 1) - y) * lp
		var t := float(i) / n
		var env := sin(t * PI) if swell else pow(1.0 - t, 2.0)
		d.append(y * env * vol * 3.0)
	return _wav(d)

func _sweep(f0: float, f1: float, dur: float) -> AudioStreamWAV:
	var d := PackedFloat32Array(); var ph := 0.0; var n := int(dur * RATE)
	for i in n:
		var t := float(i) / n
		ph += TAU * lerpf(f0, f1, t * t) / RATE
		d.append((sin(ph) * 0.5 + sin(ph * 0.5) * 0.3) * sin(t * PI) * 0.5)
	return _wav(d)

func _buzz() -> AudioStreamWAV:
	var d := PackedFloat32Array(); var n := RATE
	for i in n:
		var t := float(i) / RATE
		var v := sin(TAU * 110.0 * t) * 0.4 + sin(TAU * 220.0 * t) * 0.25 + sin(TAU * 663.0 * t) * 0.12 * (0.6 + 0.4 * sin(TAU * 9.0 * t))
		d.append(v * 0.45)
	return _wav(d, true)

func _rumble(lp: float) -> AudioStreamWAV:
	var n := RATE * 3; var d := PackedFloat32Array(); d.resize(n); var y := 0.0
	var rnd := RandomNumberGenerator.new(); rnd.seed = int(lp * 1000.0)
	for i in n:
		y += (rnd.randf_range(-1, 1) - y) * lp
		d[i] = y
	# Crossfade the ends so the loop is seamless.
	var f := RATE / 4
	for i in f:
		var t := float(i) / f
		d[i] = d[i] * t + d[n - f + i] * (1.0 - t)
	d.resize(n - f)
	var peak := 0.001
	for v in d: peak = maxf(peak, absf(v))
	for i in d.size(): d[i] = d[i] / peak * 0.6
	return _wav(d, true)

func _loop_player(st: AudioStream) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new(); p.stream = st; p.volume_db = -60.0; add_child(p)
	return p

func play(name: String, db := 0.0) -> void:
	if not streams.has(name) or streams[name] == null: return
	var p: AudioStreamPlayer = pool[next]; next = (next + 1) % pool.size()
	p.stream = streams[name]; p.volume_db = db - 4.0; p.pitch_scale = randf_range(0.95, 1.05); p.play()

func loop(name: String, on: bool, pitch := 1.0, db := -10.0) -> void:
	var p: AudioStreamPlayer = loops[name]
	if on and not p.playing: p.play()
	p.volume_db = move_toward(p.volume_db, db if on else -60.0, 4.0)
	p.pitch_scale = pitch
	if not on and p.volume_db <= -59.0 and p.playing: p.stop()

func set_volume(v: float) -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(v, 0.0001)))

func set_music(on: bool) -> void:
	if not on: music.stop(); music_track = ""

func ambient(main, _dt: float) -> void:
	var s: Ship = main.ship
	var flying: bool = s != null and main.mode == "ship" and s.state != "landed" and s.state != "docked"
	loop("engine", flying, 0.6 + (s.throttle * 0.7 + (0.4 if s.boost else 0.0) if s else 0.0), -9.0)
	var surface: bool = main.world is SurfaceWorld and not main.world.biome.get("airless", false)
	loop("wind", surface, 1.0 + (minf(s.speed / 200.0, 1.0) if flying else 0.0), -24.0 if not flying else -15.0)
	var want := "level_music" if main.world is SurfaceWorld else "menu_intro_music"
	if Game.s.settings.music and (music_track != want or not music.playing):
		music_track = want
		var st: AudioStream = load("res://assets/audio/%s.ogg" % want)
		if st is AudioStreamOggVorbis: st.loop = true
		music.stream = st; music.play()
