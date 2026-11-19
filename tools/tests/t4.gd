extends RefCounted
## Look at every kind of world.
func shot(main, name: String, frames := 10) -> void:
	for i in frames: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/%s.png" % name)
	print("SHOT ", name)

func run(main) -> void:
	var list := [["1,0", 0], ["1,0", 1], ["0,1", 0], ["0,1", 1], ["0,0", 2]]
	if main.args.has("only"): list = [list[int(main.args.only)]]
	for it in list:
		var sys := Universe.system(it[0])
		Game.s.flags.erase("placed")
		main.busy = true
		await main._load_surface(sys, sys.planets[it[1]], false)
		main.busy = false
		var w: SurfaceWorld = main.world
		var s: Dictionary = w.sites[0] if not w.sites.is_empty() else {"pos": Vector3.ZERO, "radius": 50.0}
		var p: Player = w.player
		var at: Vector3 = s.pos + Vector3(s.radius + 26.0, 0, s.radius * 0.6)
		p.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.3, at.z)
		var d: Vector3 = s.pos + Vector3(0, 6, 0) - (p.global_position + Vector3(0, 1.5, 0))
		p.yaw = atan2(-d.x, -d.z); p.pitch = asin(d.normalized().y)
		for i in 500:
			await main.get_tree().process_frame
			if i > 20 and not w.loading(): break
		await shot(main, "b-%s-%d" % [sys.planets[it[1]].type, it[1]], 12)
		p.yaw += 2.4; p.pitch = -0.02
		await shot(main, "b-%s-%d-wild" % [sys.planets[it[1]].type, it[1]], 12)
	print("DONE")
