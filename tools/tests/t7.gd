extends RefCounted
func run(main) -> void:
	var sys := Universe.system("0,0")
	Game.s.flags.erase("placed"); main.busy = true
	await main._load_surface(sys, sys.planets[2], false)
	main.busy = false
	var w: SurfaceWorld = main.world; var p: Player = w.player
	var s: Dictionary = w.sites[0]
	var at: Vector3 = s.pos + Vector3(s.radius + 26.0, 0, s.radius * 0.6)
	p.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.3, at.z)
	var d: Vector3 = s.pos + Vector3(0, 6, 0) - (p.global_position + Vector3(0, 1.5, 0))
	p.yaw = atan2(-d.x, -d.z) + 2.4; p.pitch = -0.02
	if main.args.has("no_actors"):
		for a in w.actors: a.queue_free()
	if main.args.has("no_site"): s.node.visible = false
	if main.args.has("no_ship"): w.ship.visible = false
	for i in 60: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/x-%s.png" % main.args.get("tag", "base"))
	print("DONE")
