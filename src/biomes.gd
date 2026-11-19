class_name Biomes
## Planet types: which scanned materials, colours, air and life each one has.

const T := "res://assets/tex/"

const TYPES := {
	"lush": {
		"label": "Temperate world", "a": "forrest_ground_01", "b": "forest_leaves_02", "rock": "rock_face_03", "c": "coast_sand_01",
		"tint_a": Color(0.78, 0.95, 0.62), "tint_b": Color(0.9, 0.85, 0.7), "tint_rock": Color(0.62, 0.64, 0.66),
		"sea": 0.0, "water": Color(0.02, 0.16, 0.2), "snow_line": 330.0, "relief": 1.0,
		"sky": Color(0.25, 0.48, 1.0), "haze": Color(0.72, 0.82, 0.95), "clouds": 0.5, "fog": 0.012,
		"trees": ["broadleaf", "broadleaf2", "pine"], "tree_density": 1.0, "grass": 1.0, "grass_col": Color(0.3, 0.44, 0.13),
		"plants": ["fern_02", "shrub_02", "shrub_03", "nettle_plant", "celandine_01", "dandelion_01"],
		"rocks": ["boulder_01", "rock_moss_set_01", "namaqualand_boulder_03"], "hazard": "",
	},
	"desert": {
		"label": "Arid world", "a": "red_sand", "b": "coast_sand_01", "rock": "cliff_side", "c": "red_sand",
		"tint_a": Color(1.0, 0.82, 0.62), "tint_b": Color(1.0, 0.85, 0.65), "tint_rock": Color(1.0, 0.78, 0.62),
		"sea": -400.0, "water": Color(0.1, 0.2, 0.2), "snow_line": 9000.0, "relief": 1.15,
		"sky": Color(0.45, 0.55, 0.85), "haze": Color(0.98, 0.82, 0.62), "clouds": 0.15, "fog": 0.02,
		"trees": ["quiver"], "tree_density": 0.12, "grass": 0.12, "grass_col": Color(0.62, 0.55, 0.28),
		"plants": ["wild_rooibos_bush", "shrub_04"],
		"rocks": ["namaqualand_boulder_02", "namaqualand_boulder_04", "namaqualand_boulder_05", "namaqualand_cliff_01"], "hazard": "Extreme heat",
	},
	"frozen": {
		"label": "Frozen world", "a": "snow_02", "b": "snow_02", "rock": "dark_rock_02", "c": "snow_02",
		"tint_a": Color(0.95, 0.97, 1.0), "tint_b": Color(0.85, 0.9, 1.0), "tint_rock": Color(0.75, 0.8, 0.9),
		"sea": -6.0, "water": Color(0.03, 0.12, 0.2), "snow_line": -100.0, "relief": 1.1,
		"sky": Color(0.35, 0.55, 0.95), "haze": Color(0.85, 0.9, 1.0), "clouds": 0.65, "fog": 0.03,
		"trees": ["pine", "fir"], "tree_density": 0.5, "grass": 0.0, "grass_col": Color(0.6, 0.65, 0.6),
		"plants": [], "rocks": ["boulder_01", "namaqualand_boulder_03"], "hazard": "Freezing cold",
	},
	"volcanic": {
		"label": "Scorched world", "a": "burned_ground_01", "b": "dark_rock_02", "rock": "dark_rock_02", "c": "burned_ground_01",
		"tint_a": Color(0.7, 0.62, 0.58), "tint_b": Color(0.6, 0.55, 0.55), "tint_rock": Color(0.55, 0.5, 0.5),
		"sea": -8.0, "water": Color(1.0, 0.25, 0.02), "lava": true, "snow_line": 9000.0, "relief": 1.3,
		"sky": Color(0.5, 0.3, 0.25), "haze": Color(0.75, 0.42, 0.28), "clouds": 0.7, "fog": 0.035,
		"trees": ["dead"], "tree_density": 0.2, "grass": 0.0, "grass_col": Color(0.3, 0.3, 0.3),
		"plants": [], "rocks": ["namaqualand_boulder_02", "namaqualand_cliff_01", "moon_rock_01"], "hazard": "Toxic ash",
	},
	"barren": {
		"label": "Airless moon", "a": "moon_01", "b": "moon_01", "rock": "dark_rock_02", "c": "moon_01",
		"tint_a": Color(0.85, 0.85, 0.88), "tint_b": Color(0.7, 0.7, 0.74), "tint_rock": Color(0.7, 0.7, 0.72),
		"sea": -900.0, "water": Color(0, 0, 0), "snow_line": 9000.0, "relief": 0.8,
		"sky": Color(0.0, 0.0, 0.0), "haze": Color(0.02, 0.02, 0.03), "clouds": 0.0, "fog": 0.0, "airless": true,
		"trees": [], "tree_density": 0.0, "grass": 0.0, "grass_col": Color(0.5, 0.5, 0.5),
		"plants": [], "rocks": ["moon_rock_01", "moon_rock_02", "moon_rock_03"], "hazard": "No atmosphere",
	},
	"exotic": {
		"label": "Exotic world", "a": "aerial_grass_rock", "b": "brown_mud_leaves_01", "rock": "rock_face_03", "c": "coast_sand_01",
		"tint_a": Color(0.95, 0.55, 0.85), "tint_b": Color(0.7, 0.6, 0.9), "tint_rock": Color(0.8, 0.75, 0.95),
		"sea": 0.0, "water": Color(0.1, 0.05, 0.22), "snow_line": 9000.0, "relief": 1.2,
		"sky": Color(0.55, 0.3, 0.85), "haze": Color(0.85, 0.65, 0.95), "clouds": 0.4, "fog": 0.022,
		"trees": ["jacaranda", "broadleaf2"], "tree_density": 0.7, "grass": 0.9, "grass_col": Color(0.75, 0.3, 0.6),
		"plants": ["fern_02", "shrub_03", "flower_gazania", "flower_ursinia"],
		"rocks": ["rock_moss_set_01", "boulder_01"], "hazard": "Radiation",
	},
}

static func tex(set_name: String, kind: String) -> Texture2D:
	return load(T + set_name + "/" + kind + ".jpg")
