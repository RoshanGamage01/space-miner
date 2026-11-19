extends RefCounted
## Menus, combat, the Gate and night.
func shot(main, name: String, frames := 8) -> void:
	for i in frames: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/%s.png" % name)
	print("SHOT ", name)

func load_planet(main, sid: String, idx: int) -> void:
	var sys := Universe.system(sid)
	Game.s.flags.erase("placed")
	main.busy = true
	await main._load_surface(sys, sys.planets[idx], false)
	main.busy = false

func stand(main, at: Vector3, look: Vector3) -> void:
	var w: SurfaceWorld = main.world; var p: Player = w.player
	p.global_position = Vector3(at.x, w.hf.height(at.x, at.z) + 0.3, at.z)
	var d := look - (p.global_position + Vector3(0, 1.5, 0))
	p.yaw = atan2(-d.x, -d.z); p.pitch = asin(d.normalized().y)
	for i in 500:
		await main.get_tree().process_frame
		if i > 15 and not w.loading(): break

func run(main) -> void:
	var part: String = main.args.get("part", "all")
	if part == "all" or part == "ui":
		if part == "ui": main.world.atmo.time_of_day = 0.92; main.world.atmo.day_length = 1e9
		Game.add_item("ferrite", 42); Game.add_item("copper", 9); Game.add_item("aetherium", 7); Game.s.units = 4200
		var v: Dictionary = main.world.site_of("village")
		await stand(main, v.pos + Vector3(2.5, 0, 15.5), v.pos + Vector3(0, 1.5, 9.5))
		await shot(main, "u1-elder")
		main.talk("elder"); await shot(main, "u2-dialogue", 4); main.menus.close()
		main.menus.inventory(); await shot(main, "u3-inventory", 4); main.menus.close()
		main.menus.shop("upgrades"); await shot(main, "u4-upgrades", 4)
		main.menus.shop("style"); await shot(main, "u5-style", 4); main.menus.close()
		main.menus.journal(); await shot(main, "u6-journal", 4); main.menus.close()
		main.menus.pause(); await shot(main, "u7-pause", 4)
		main.menus.settings(false); await shot(main, "u8-settings", 4); main.menus.close()
		main.menus.title(); await shot(main, "u9-title", 4); main.menus._start()
		# Night.
		main.world.atmo.time_of_day = 0.92; main.world.atmo.day_length = 1e9
		await stand(main, v.pos + Vector3(40, 0, 46), v.pos + Vector3(0, 4, 0))
		await shot(main, "u10-night", 14)
	if part == "all" or part == "fight":
		await load_planet(main, "1,0", 0)
		var den: Dictionary = main.world.site_of("outpost")
		await stand(main, den.pos + Vector3(34, 0, 30), den.pos + Vector3(0, 2, 0))
		main.world.player.tool_ = "bolt"
		for i in 25: await main.get_tree().process_frame
		Input.action_press("fire")
		await shot(main, "c1-den", 10)
		await shot(main, "c2-fight", 14)
		Input.action_release("fire")
		print("hp ", main.world.player.health, " shield ", main.world.player.shield, " kills ", Game.s.stats.kills)
	if part == "space":
		Game.s.flags["ship_repaired"] = true
		main.board_ship(); await main.to_space()
		var w: SpaceWorld = main.world; var s: Ship = main.ship
		s.throttle = 0.0; s.vel = Vector3.ZERO
		var pl: Dictionary = w.planets[0]
		s.global_position = pl.node.position + (w.sun_dir + Vector3(0.5, 0.2, 0)).normalized() * pl.radius * 2.6
		s.look_at(pl.node.position + Vector3(0, pl.radius * 0.2, 0), Vector3.UP)
		await shot(main, "s1-planet", 14)
		main.dock(); main.menus.close()
		await shot(main, "s2-docked", 10)
	if part == "all" or part == "gate":
		await load_planet(main, "1,1", 0)
		var g: Dictionary = main.world.site_of("gate")
		Game.s.quest = {"q": 5, "s": 2, "n": 0}
		await stand(main, g.pos + Vector3(20, 0, 78), g.pos + Vector3(0, 16, 0))
		await shot(main, "g1-gate", 12)
		main.world.player.view = "third"
		await shot(main, "g2-warden", 20)
	print("DONE")
