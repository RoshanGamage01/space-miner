extends RefCounted
## Flight: takeoff, space, station, docking.
func shot(main, name: String, frames := 10) -> void:
	for i in frames: await main.get_tree().process_frame
	main.get_viewport().get_texture().get_image().save_png("res://shots/%s.png" % name)
	print("SHOT ", name)

func wait(main, n: int) -> void:
	for i in n: await main.get_tree().process_frame

func run(main) -> void:
	Game.s.flags["ship_repaired"] = true
	Game.s.quest = {"q": 1, "s": 0, "n": 0}
	main.board_ship()
	print("mode ", main.mode, " state ", main.ship.state)
	main.ship.state = "flying"
	main.ship.global_position.y = main.world.hf.sea + 3500.0
	await wait(main, 4)
	for i in 600:
		await main.get_tree().process_frame
		if main.world is SpaceWorld and not main.busy: break
	print("in space ", main.world is SpaceWorld, " quest ", Game.quest_text().text)
	var w: SpaceWorld = main.world
	var s: Ship = main.ship
	s.throttle = 0.0; s.vel = Vector3.ZERO
	var pl: Dictionary = w.planets[0]
	s.global_position = pl.node.position + (w.sun_dir + Vector3(0.5, 0.2, 0)).normalized() * pl.radius * 2.6
	s.look_at(pl.node.position + Vector3(0, pl.radius * 0.2, 0), Vector3.UP)
	await shot(main, "f4-planet", 14)
	s.global_position = w.station.position + Vector3(260, 90, 520)
	s.look_at(w.station.position, Vector3.UP)
	await shot(main, "f5-station", 14)
	s.global_position = w.bay + Vector3(0, 0, 120); s.look_at(w.bay, Vector3.UP); s.throttle = 0.2
	for i in 200:
		await main.get_tree().process_frame
		if s.state == "docked": break
	print("docked ", s.state, " panel ", main.menus.open, " quest ", Game.quest_text().text)
	await shot(main, "f6-docked", 6)
	main.menus.shop("trade")
	await shot(main, "f7-market", 4)
	main.menus.galaxy()
	await shot(main, "f8-galaxy", 4)
	main.menus.close()
	print("DONE")
