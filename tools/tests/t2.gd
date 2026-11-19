extends RefCounted
## Village tour.
func shot(main, name: String, frames := 12) -> void:
	for i in frames: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/%s.png" % name)
	print("SHOT ", name)

func go(main, pos: Vector3, look: Vector3, eye := 0.0) -> void:
	var w: SurfaceWorld = main.world; var p: Player = w.player
	p.global_position = Vector3(pos.x, w.hf.height(pos.x, pos.z) + 0.3 + eye, pos.z)
	var d := look - (p.global_position + Vector3(0, 1.5, 0))
	p.yaw = atan2(-d.x, -d.z); p.pitch = asin(d.normalized().y)
	for i in 400:
		await main.get_tree().process_frame
		if i > 15 and not w.loading(): break

func run(main) -> void:
	var w: SurfaceWorld = main.world
	var v: Dictionary = w.site_of("village")
	await go(main, v.pos + Vector3(48, 0, 62), v.pos + Vector3(0, 4, 0))
	await shot(main, "v1-village")
	await go(main, v.pos + Vector3(3, 0, 16), v.pos + Vector3(0, 1.4, 9.5))
	await shot(main, "v2-elder")
	print("prompt ", main.hud.prompt.text, " actors ", w.actors.size())
	main.world.player.view = "third"
	await go(main, v.pos + Vector3(14, 0, 24), v.pos + Vector3(9, 1.5, 15))
	await shot(main, "v3-market")
	print("DONE")
