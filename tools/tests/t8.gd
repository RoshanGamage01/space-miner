extends RefCounted
func run(main) -> void:
	var w: SurfaceWorld = main.world; var p: Player = w.player
	var v: Dictionary = w.site_of("village")
	var pad: Vector3 = v.pos + Vector3(50, 0, 6)
	var at := pad + Vector3(16, 0, 10)
	p.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.3, at.z)
	var d := pad + Vector3(0, 1, 0) - (p.global_position + Vector3(0, 1.5, 0))
	p.yaw = atan2(-d.x, -d.z); p.pitch = asin(d.normalized().y)
	if main.args.has("night"): w.atmo.time_of_day = 0.92; w.atmo.day_length = 1e9
	for i in 500:
		await main.get_tree().process_frame
		if i > 30 and not w.loading(): break
	for i in 20: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/y-%s.png" % main.args.get("tag", "base"))
	print("DONE")
