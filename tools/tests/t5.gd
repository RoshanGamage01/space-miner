extends RefCounted
## Headless playthrough of the whole story using the real game objects.
var main
var fails := 0

func ok(cond: bool, what: String) -> void:
	if not cond: fails += 1
	print(("  ok   " if cond else "  FAIL ") + what)

func frames(n: int) -> void:
	await main.get_tree().create_timer(n / 60.0, true).timeout

func settle() -> void:
	for i in 2000:
		await main.get_tree().create_timer(0.05, true).timeout
		if not main.busy and (main.world != null) and not main.world.loading(): return

func talk(role: String) -> void:
	main.talk(role)
	for i in 8:
		if main.menus.open != "dialogue": break
		main.menus._dlg_next()
	await frames(2)

func land_at(site_type: String) -> void:
	var w: SurfaceWorld = main.world
	var s: Dictionary = w.site_of(site_type)
	main.ship.global_position = s.pos + Vector3(s.radius + 40.0, 60.0, 0)
	main.ship.vel = Vector3.ZERO; main.ship.throttle = 0.0; main.ship.state = "landing"
	for i in 1200:
		await main.get_tree().create_timer(0.05, true).timeout
		if main.ship.state == "landed": break
	await frames(3)

func q() -> String: return "%d.%d" % [Game.s.quest.q, Game.s.quest.s]

func run(m) -> void:
	main = m
	print("== Act 1")
	ok(q() == "0.0", "starts at the wreck")
	ok(main.mode == "foot" and main.world is SurfaceWorld, "on foot on a planet")
	await frames(30)
	ok(main.world.player.is_on_floor(), "standing on the ground")
	main.board_ship(); ok(main.mode == "foot", "cannot board a broken ship")
	Game.add_item("ferrite", 30); await frames(40); ok(q() == "0.1", "ferrite step")
	Game.add_item("carbon", 20); await frames(40); ok(q() == "0.2", "carbon step")
	main.board_ship(); ok(Game.s.flags.has("ship_repaired") and q() == "0.3", "ship repaired")
	ok(Game.count("ferrite") == 0, "materials consumed")
	await talk("elder"); ok(q() == "1.0", "elder sends us skyward"); ok(Game.s.units == 900, "rewards paid: %d" % Game.s.units)
	print("== Act 2")
	main.board_ship(); ok(main.mode == "ship", "boarded")
	main.leave_ship(); ok(main.mode == "foot" and main.world.player.active, "left the ship")
	main.board_ship()
	await main.to_space(); await settle()
	ok(main.world is SpaceWorld and q() == "1.1", "reached space")
	main.dock(); ok(main.ship.state == "docked" and main.menus.open == "station" and q() == "1.2", "docked")
	main.menus.close()
	await talk("envoy"); ok(q() == "2.0", "envoy gives the mission")
	main.menus.close(); main.undock(); ok(main.ship.state == "flying", "undocked")
	await main.to_surface(main.world.sys.planets[1]); await settle()
	ok(main.world is SurfaceWorld and main.world.desc.name == "Thalora" and main.mode == "ship", "entered Thalora in the ship")
	await land_at("capital"); ok(q() == "2.1", "landed at the Spire")
	main.leave_ship()
	await talk("arbiter"); ok(q() == "2.2", "arbiter states the price")
	await talk("arbiter"); ok(q() == "2.2", "no payment, no shard")
	Game.add_item("copper", 25); Game.add_item("gold", 4)
	await talk("arbiter"); ok(q() == "3.0" and Game.count("shard_accord") == 1 and Game.count("warp_cell") == 2, "Shard of Accord")
	# Trade
	var sys: Dictionary = main.world.sys
	var u0: int = Game.s.units
	ok(Game.buy("silk", 5, sys) == "" and Game.count("silk") == 5 and Game.s.units < u0, "bought silk")
	ok(Game.buy("ale", 1, sys) != "", "ale is not sold here")
	ok(Game.sell_price("silk", Universe.system("1,0")) > Game.buy_price("silk", sys) * 1.5, "silk is a profitable route")
	ok(Game.buy_upgrade("mining") == "" and Game.level("mining") == 1, "bought an upgrade")
	main.contracts("thalori", 0); ok(Game.s.bounty != null and main.menus.open == "dialogue", "took a contract")
	main.menus.close()
	print("== Act 3")
	main.board_ship(); await main.to_space(); await settle()
	await main.warp("1,0"); await settle()
	ok(main.world.sys.name == "Karg Forge" and q() == "3.1" and Game.count("warp_cell") == 1, "warped to Karg Forge")
	await main.to_surface(main.world.sys.planets[0]); await settle()
	await land_at("capital"); main.leave_ship()
	await talk("warchief"); ok(q() == "3.2", "warchief names the price")
	var w: SurfaceWorld = main.world
	var den: Dictionary = w.site_of("outpost")
	w.player.global_position = den.pos + Vector3(40, 1, 0)
	await frames(10)
	var rogues := w.actors.filter(func(a): return is_instance_valid(a) and a.kind == "rogue")
	ok(rogues.size() == 5, "five rogues at the den: %d" % rogues.size())
	await frames(240)
	ok(w.bolts.size() > 0 or w.player.shield < Game.shield_max() or w.player.health < 100.0, "rogues attack")
	for r in rogues: r.damage(999.0)
	await frames(5)
	ok(q() == "3.3", "den destroyed")
	w.player.health = 100.0; w.player.dead = false
	await talk("warchief"); ok(q() == "4.0" and Game.count("shard_valor") == 1, "Shard of Valor")
	main.board_ship(); await main.to_space(); await settle()
	await main.warp("0,0"); await settle()
	await main.warp("0,1"); await settle()
	ok(main.world.sys.name == "Whisperdeep" and q() == "4.1", "warped to Whisperdeep")
	await main.to_surface(main.world.sys.planets[0]); await settle()
	await land_at("capital"); main.leave_ship()
	await talk("choir"); ok(q() == "4.2", "choir asks for the core")
	w = main.world
	var ruins: Dictionary = w.site_of("ruins")
	w.player.global_position = ruins.pos + Vector3(0, 2, 2)
	await frames(5)
	var it: Dictionary = w.prompt_for(w.player.global_position)
	ok(not it.is_empty() and it.text == "Take the Echo Core", "relic prompt")
	if not it.is_empty(): it.call.call()
	ok(q() == "4.3" and Game.s.flags.has("echo_core"), "echo core taken")
	await talk("choir"); ok(q() == "5.0" and Game.count("shard_memory") == 1, "Shard of Memory")
	print("== Act 4")
	Game.add_item("warp_cell", 3)
	main.board_ship(); await main.to_space(); await settle()
	await main.warp("1,1"); await settle()
	ok(q() == "5.1", "warped to The Silence")
	await main.to_surface(main.world.sys.planets[0]); await settle()
	await land_at("gate"); ok(q() == "5.2", "landed at the Gate")
	main.leave_ship(); await frames(10)
	ok(is_instance_valid(main.warden), "the Warden appears")
	w = main.world
	ok(w.prompt_for(w.site_of("gate").pos + Vector3(0, 3, 9)).is_empty(), "gate is locked while the Warden lives")
	if is_instance_valid(main.warden): main.warden.damage(99999.0)
	await frames(5)
	ok(q() == "5.3" and Game.s.flags.has("warden_down"), "Warden defeated")
	it = w.prompt_for(w.site_of("gate").pos + Vector3(0, 3, 9))
	ok(not it.is_empty(), "gate can be used")
	main.use_gate(); ok(main.menus.open == "choice", "the choice is offered")
	main.menus._end("seal"); ok(Game.s.flags.ending == "seal" and Game.s.quest.q == 6, "ending reached")
	main.menus.close()
	ok(Game.quest_text().title == "Free flight", "free play after the story")
	print("== Saving")
	main.persist(); Game.save()
	var snap: String = JSON.stringify(Game.s.quest) + str(Game.s.units) + JSON.stringify(Game.s.inv)
	Game.s = Game.new_game()
	ok(Game.load_save(), "save loads")
	ok(JSON.stringify(Game.s.quest) + str(Game.s.units) + JSON.stringify(Game.s.inv) == snap, "save round-trips")
	var f := FileAccess.open(Game.SAVE_PATH, FileAccess.WRITE); f.store_string("{broken"); f.close()
	ok(not Game.load_save(), "corrupt save is rejected")
	f = FileAccess.open(Game.SAVE_PATH, FileAccess.WRITE); f.store_string('{"version":1,"units":-50,"inv":{"gold":99999999,"junk":4},"upgrades":{"mining":99},"quest":{"q":2,"s":77,"n":0},"system":"zz","settings":{"quality":9}}'); f.close()
	ok(Game.load_save() and Game.s.units == 0 and Game.s.inv.gold <= 5000 and not Game.s.inv.has("junk") and Game.s.upgrades.mining == 4 and Game.s.quest.s == 0 and Game.s.system == "0,0" and Game.s.settings.quality == 3, "bad values are repaired")
	Game.wipe()
	print("== Universe")
	var a := Universe.system("37,-12"); Universe._cache.clear(); var b := Universe.system("37,-12")
	ok(JSON.stringify(a.planets.map(func(p): return p.name)) == JSON.stringify(b.planets.map(func(p): return p.name)), "systems are repeatable")
	var far := Universe.system("-9999999,424242"); ok(far.planets.size() >= 2, "the galaxy has no edge")
	var names := {}
	for x in range(-15, 15): for y in range(-15, 15): names[Universe.star(x, y).id] = true
	ok(names.size() == 900, "every star is distinct")
	print("RESULT fails=%d" % fails)
