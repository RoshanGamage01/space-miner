extends SceneTree
func _init():
	for path in ["res://assets/robot/player.glb", "res://assets/enemy/red_robot.glb"]:
		var s: Node = load(path).instantiate()
		print("== ", path)
		_dump(s, 0)
		s.free()
	quit()
func _dump(n: Node, d: int):
	var extra := ""
	if n is MeshInstance3D: extra = " aabb=%s surfaces=%d mats=%s" % [n.get_aabb(), n.mesh.get_surface_count(), n.mesh.surface_get_material(0)]
	if n is AnimationPlayer: extra = " anims=%s" % [n.get_animation_list()]
	if n is Node3D and d < 3: extra += " pos=%s scale=%s" % [n.position, n.scale]
	if not (n is BoneAttachment3D) and d < 4: print("  ".repeat(d), n.name, " [", n.get_class(), "]", extra)
	for c in n.get_children(): _dump(c, d + 1)
