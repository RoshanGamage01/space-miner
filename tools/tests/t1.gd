extends RefCounted
## First look: spawn, views, mining.
func shot(main, name: String, frames := 30) -> void:
	for i in frames: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/%s.png" % name)
	print("SHOT ", name)

func run(main) -> void:
	var w: SurfaceWorld = main.world
	var p: Player = w.player
	print("spawn ", p.global_position, " ship ", w.ship.global_position, " sites ", w.sites.map(func(s): return [s.type, s.pos]))
	for i in 60: await main.get_tree().process_frame
	print("on floor ", p.is_on_floor(), " y=", p.global_position.y, " ground=", w.hf.height(p.global_position.x, p.global_position.z))
	# look at the ship
	var to: Vector3 = w.ship.global_position - p.global_position
	p.yaw = atan2(-to.x, -to.z); p.pitch = -0.05
	p.view = "third"; p.yaw += 2.6; p.pitch = -0.12
	await shot(main, "p2-third", 12)
	# mine a boulder: find nearest rock collider
	p.view = "first"
	var best = null; var bd := 1e9
	for c in w.flora.bigs.values():
		if c.bodies == null: continue
		for b in c.bodies.get_children():
			if b.get_meta("res").kind != "rock": continue
			var d: float = b.global_position.distance_to(p.global_position)
			if d < bd: bd = d; best = b
	print("nearest rock ", bd)
	if best:
		var rp: Vector3 = best.global_position
		var dir := (p.global_position - rp); dir.y = 0; dir = dir.normalized()
		var size: float = best.get_meta("res").hp / 6.0
		var at := rp + dir * (size + 4.0)
		p.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.3, at.z)
		for i in 20: await main.get_tree().process_frame
		var aim := rp + Vector3(0, size * 0.3, 0) - (p.global_position + Vector3(0, 1.5, 0))
		p.yaw = atan2(-aim.x, -aim.z); p.pitch = asin(aim.normalized().y)
		await shot(main, "p3-rock", 10)
		Input.action_press("fire")
		for i in 40: await main.get_tree().process_frame
		await shot(main, "p4-mining", 2)
		for i in 200: await main.get_tree().process_frame
		Input.action_release("fire")
		print("ferrite ", Game.count("ferrite"), " quest ", Game.quest_text().text)
	print("DONE")
