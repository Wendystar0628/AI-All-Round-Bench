"""Builds every material and maps objects / slots to them (category splits use object-level slots so
shared meshes are never affected by accident)."""
import bpy
import re
import gh_materials as GM

M = {}


def build_all_materials():
    GM.TIME = GM.time_group()
    W = GM
    # --- metals
    M["MAT_CastIron"] = W.mat_castiron_white("MAT_CastIron")
    M["MAT_Iron_Dark"] = W.mat_iron_dark("MAT_Iron_Dark")
    M["MAT_Iron_Grate"] = W.mat_iron_dark("MAT_Iron_Grate", base=('#26221F', '#3A2E26'))
    M["MAT_Steel_Tool"] = W.mat_steel_tool()
    M["MAT_Copper"] = W.mat_copper("MAT_Copper", verdigris=0.6)
    M["MAT_Copper_Polished"] = W.mat_copper("MAT_Copper_Polished", verdigris=0.25, polished=0.75)
    M["MAT_Copper_Roof"] = W.mat_copper("MAT_Copper_Roof", verdigris=1.15, wet_near_water=False)
    M["MAT_Copper_Utensil"] = W.mat_copper("MAT_Copper_Utensil", verdigris=0.22, wet_near_water=False)
    M["MAT_Brass"] = W.mat_brass()
    M["MAT_Galvanized"] = W.mat_galvanized()
    # --- glass & water
    M["MAT_Glass_Pane"] = W.mat_glass_pane("MAT_Glass_Pane")
    M["MAT_Glass_Colored_Candidate"] = W.mat_glass_pane("MAT_Glass_Colored_Candidate", colored=('#E8961A', '#F2B42E'))
    M["MAT_Glass_Colored_Teal"] = W.mat_glass_pane("MAT_Glass_Colored_Teal", colored=('#4EBDB0', '#73CFC2'))
    M["MAT_Glass_Vessel"] = W.mat_glass_vessel()
    M["MAT_Lamp_Shade_Glass"] = W.mat_lamp_glass("MAT_Lamp_Shade_Glass", milk=0.55)
    M["MAT_Lamp_Opal_Glass"] = W.mat_lamp_glass("MAT_Lamp_Opal_Glass", milk=0.92)
    M["MAT_Water"] = W.mat_water_pond("MAT_Water")
    M["MAT_Water_Basin"] = W.mat_water_basin()
    M["MAT_Water_Stream"] = W.mat_water_stream()
    M["MAT_Water_Splash"] = W.mat_water_splash()
    M["MAT_Water_Vase"] = W.mat_water_vase()
    # --- emitters
    M["MAT_Emitter_Candidate"] = W.mat_flame("MAT_Emitter_Candidate", strength=60.0)
    M["MAT_Emit_Bulb"] = W.mat_bulb("MAT_Emit_Bulb", temp=2700.0, strength=11.0)
    M["MAT_Emit_Bulb_Gas"] = W.mat_bulb("MAT_Emit_Bulb_Gas", temp=2400.0, strength=9.0, buzz=0.08)
    M["MAT_Emit_Bulb_Street"] = W.mat_bulb("MAT_Emit_Bulb_Street", temp=2900.0, strength=12.0)
    M["MAT_Emit_Fire"] = W.mat_fire("MAT_Emit_Fire", strength=16.0, scale=14.0)
    M["MAT_Emit_Fire_Stove"] = W.mat_fire("MAT_Emit_Fire_Stove", strength=20.0, scale=22.0, speed=1.9)
    # --- stone / brick / ceramics
    M["MAT_Stone_Flag"] = W.mat_stone_flag()
    M["MAT_Stone_Slate"] = W.mat_tile_glazed("MAT_Stone_Slate", '#3E4246', '#33373B', rough=0.45, coat=0.0, crackle=0.0)
    M["MAT_Stone_Coping"] = W.mat_stone_coping()
    M["MAT_Stone_Rough"] = W.mat_stone_rough()
    M["MAT_Brick"] = W.mat_brick()
    M["MAT_Mortar"] = W.mat_mortar()
    M["MAT_Plaster"] = W.mat_plaster()
    M["MAT_Tile"] = W.mat_tile_glazed("MAT_Tile", '#F1EEE6', '#E6E2D6', rough=0.08, coat=0.7, crackle=0.35)
    M["MAT_Tile_PorchIvory"] = W.mat_tile_porch("MAT_Tile_PorchIvory", '#E6DCC4', '#DCD0B6', '#C9BBA0')
    M["MAT_Tile_PorchBlack"] = W.mat_tile_porch("MAT_Tile_PorchBlack", '#1F1D1C', '#2A2724', '#4A4540')
    M["MAT_Tile_Roof"] = W.mat_roof_tile()
    M["MAT_Marble"] = W.mat_marble()
    M["MAT_Terracotta"] = W.mat_terracotta()
    M["MAT_Ceramic_Glazed"] = W.mat_ceramic_glazed()
    M["MAT_Porcelain"] = W.mat_porcelain()
    M["MAT_Porcelain_Sink"] = W.mat_porcelain_plain()
    # --- wood
    M["MAT_Wood_Floor"] = W.mat_wood("MAT_Wood_Floor", ['#7B5A3C', '#6A4C33', '#86643F', '#5E4430', '#73553A'], rough=0.55,
                                     worn_path=W.floor_traffic)
    M["MAT_Wood_Furniture"] = W.mat_wood("MAT_Wood_Furniture", ['#8F6A44', '#9C7650', '#7E5C3B', '#A27E56'], rough=0.42, coat=0.15)
    M["MAT_Wood_Structure"] = W.mat_wood("MAT_Wood_Structure", ['#4A3424', '#3F2C1F', '#56402C'], rough=0.7, dust_top=0.6)
    M["MAT_Wood_PaintedCream"] = W.mat_wood("MAT_Wood_PaintedCream", ['#8A6A4A', '#7A5C40'], rough=0.5, painted=('#E9E4D7', '#DDD6C5'))
    M["MAT_Wood_PaintedSage"] = W.mat_wood("MAT_Wood_PaintedSage", ['#8A6A4A', '#7A5C40'], rough=0.5, painted=('#7F8D72', '#71806A'))
    M["MAT_Wood_Weathered"] = W.mat_wood("MAT_Wood_Weathered", ['#8C8476', '#7E7466', '#958B7A'], rough=0.8)
    M["MAT_Bamboo"] = W.mat_wood("MAT_Bamboo", ['#C9B37A', '#B9A068'], rough=0.4)
    M["MAT_Wicker"] = W.mat_wicker()
    # --- fabric / paper / misc
    M["MAT_Linen"] = W.mat_linen("MAT_Linen")
    M["MAT_Linen_Stripe"] = W.mat_linen("MAT_Linen_Stripe", stripes=(0.12, [(0.18, 0.012, '#3B4F78'), (0.24, 0.004, '#3B4F78'), (0.75, 0.006, '#9A3B33')]))
    M["MAT_Linen_Rug"] = W.mat_linen("MAT_Linen_Rug", base=('#C9B48F', '#BFA983'), stripes=(0.4, [(0.1, 0.03, '#8E4A3A'), (0.18, 0.01, '#2F4256'),
                                                                                          (0.5, 0.06, '#6E7A5C'), (0.82, 0.01, '#2F4256'), (0.9, 0.03, '#8E4A3A')]),
                                     freq=700.0, trans=0.0)
    M["MAT_Linen_Sheer"] = W.mat_linen("MAT_Linen_Sheer", base=('#EDE4D2', '#E5DAC6'), trans=0.45)
    M["MAT_Burlap"] = W.mat_burlap()
    M["MAT_Wool"] = W.mat_wool_tartan()
    M["MAT_Coir"] = W.mat_coir()
    M["MAT_Paper"] = W.mat_paper("MAT_Paper", ('#E8DEC8', '#DCCFB4'))
    M["MAT_Paper_Kraft"] = W.mat_paper("MAT_Paper_Kraft", ('#B48E5E', '#A27E52'), fibers=0.4, trans=0.15, rough=0.75)
    M["MAT_Paper_Book"] = W.mat_paper("MAT_Paper_Book", ('#EFE6D0', '#E6DBC2'), fibers=0.15, text=True, trans=0.3)
    M["MAT_Paper_News"] = W.mat_paper("MAT_Paper_News", ('#D9D4C6', '#CFC8B8'), fibers=0.1, text=True, trans=0.2)
    M["MAT_Paper_SeedLabel"] = W.mat_seed_label()
    M["MAT_Ink"] = W.mat_ink()
    M["MAT_Twine"] = W.mat_twine()
    M["MAT_Leather"] = W.mat_leather()
    M["MAT_Rubber"] = W.mat_rubber()
    M["MAT_Wax"] = W.mat_wax()
    # --- plants
    M["MAT_Leaf_Fern"] = W.leaf_mat("MAT_Leaf_Fern", ['#4E7E2A', '#5E8C30', '#6B9634', '#4A7428'], trans_amt=0.38, rough=0.5,
                                    tip='#9A8A3A', tip_amt=0.18, trans_boost=1.7)
    M["MAT_Leaf_Ivy"] = W.leaf_mat("MAT_Leaf_Ivy", ['#2C4A1E', '#355624', '#3E5F27', '#2A4420', '#4A6A2C'], trans_amt=0.25, rough=0.28,
                                   spec=0.55, coat=0.25, midrib=0.35, veins=0.0, trans_boost=1.5)
    M["MAT_Leaf_Broad"] = W.leaf_mat("MAT_Leaf_Broad", ['#3F6A2A', '#4C7630', '#5A7E34'], trans_amt=0.3, rough=0.45, midrib=0.3, veins=0.12)
    M["MAT_Leaf_Hosta"] = W.leaf_mat("MAT_Leaf_Hosta", ['#3E6B34', '#4A7438', '#557A3A'], trans_amt=0.28, rough=0.42, midrib=0.25,
                                     veins=0.25, margin=('#D9D29A', 0.33), gen_axis_v=True)
    M["MAT_Leaf_Hydrangea"] = W.leaf_mat("MAT_Leaf_Hydrangea", ['#3A6427', '#46702C', '#3E6A2A'], trans_amt=0.3, rough=0.48, midrib=0.3, veins=0.2)
    M["MAT_Leaf_Geranium"] = W.leaf_mat("MAT_Leaf_Geranium", ['#4E7A32', '#5A8436', '#557E34'], trans_amt=0.3, rough=0.55,
                                        zonal=('#4A3A1E', 0.26))
    M["MAT_Leaf_LilyPad"] = W.leaf_mat("MAT_Leaf_LilyPad", ['#2E5530', '#355E33', '#3A5E2E', '#4A5E2A'], trans_amt=0.12, rough=0.22, spec=0.6,
                                       coat=0.5, veins=0.0, droplets=1.0, under='#6E2E2E', tip='#7A3A2A', tip_amt=0.0)
    M["MAT_Leaf_Seedling"] = W.leaf_mat("MAT_Leaf_Seedling", ['#86C04E', '#92C855', '#7AB648'], trans_amt=0.45, rough=0.38, midrib=0.4, trans_boost=1.8)
    M["MAT_Leaf_Tree"] = W.leaf_mat("MAT_Leaf_Tree", ['#3A5A26', '#456A2C', '#50702E', '#3E5E28'], trans_amt=0.32, rough=0.5)
    M["MAT_Leaf_Herb"] = W.leaf_mat("MAT_Leaf_Herb", ['#7A8C66', '#6E8460', '#839270'], trans_amt=0.25, rough=0.65)
    M["MAT_Leaf_Palm"] = W.leaf_mat("MAT_Leaf_Palm", ['#2E5225', '#36592A', '#3F6230'], trans_amt=0.3, rough=0.32, coat=0.2,
                                    tip='#8A6A3A', tip_amt=0.12, midrib=0.3)
    M["MAT_Leaf_Orchid"] = W.leaf_mat("MAT_Leaf_Orchid", ['#345C2C', '#3B6432', '#2F542A'], trans_amt=0.15, rough=0.25, coat=0.4,
                                      spots=0.5, spot_col='#4A2E40', midrib=0.2)
    M["MAT_Leaf_Fallen"] = W.leaf_mat("MAT_Leaf_Fallen", ['#8A5A2A', '#A0702E', '#6E4A26', '#B08A3E'], trans_amt=0.2, rough=0.7, midrib=0.3, veins=0.15)
    M["MAT_Petal_Hydrangea"] = W.petal_mat("MAT_Petal_Hydrangea", ['#6E8FD8', '#7E86D6', '#9378C8', '#A97FC6', '#8AA0DC'], by='gradient',
                                           world_scale=2.6, trans_amt=0.4, grad=('#C9B7E8', 0.6, 1.0, 0.35))
    M["MAT_Petal_Geranium"] = W.petal_mat("MAT_Petal_Geranium", ['#D3283A', '#E0402E', '#E8708E', '#D8344A', '#F08A9C'], by='cluster',
                                          world_scale=3.0, trans_amt=0.45, sheen=0.4)
    M["MAT_Petal_Orchid"] = W.petal_mat("MAT_Petal_Orchid", ['#FAF6F4', '#F8F1F2', '#FBF7F2'], trans_amt=0.45, sheen=0.45,
                                        blush=('#E07BA6', 0.45, 0.85), veins=0.12, sss=0.1)
    M["MAT_Petal_Rose"] = W.petal_mat("MAT_Petal_Rose", ['#F2B8B5', '#F5C9A6', '#F3E4CF', '#D9707E', '#F0A9A0'], trans_amt=0.42,
                                      grad=('#FBE8DE', 0.55, 1.0, 0.4), sheen=0.5)
    M["MAT_Petal_Lavender"] = W.petal_mat("MAT_Petal_Lavender", ['#8A76C0', '#7A66B4', '#9886C8'], trans_amt=0.3, rough=0.6, by='gradient', world_scale=5.0)
    M["MAT_Petal_Lily"] = W.petal_mat("MAT_Petal_Lily", ['#FBF6F3', '#FAF1F0'], trans_amt=0.45, grad=('#F09AB4', 0.45, 1.0, 0.85),
                                      blush=('#FFF6E0', 0.3, 0.6), veins=0.1)
    M["MAT_Petal_LilyStamen"] = W.petal_mat("MAT_Petal_LilyStamen", ['#F2C02E', '#E8A81E'], trans_amt=0.3, rough=0.6, veins=0.0)
    M["MAT_Dried_Flower"] = W.petal_mat("MAT_Dried_Flower", ['#B88A84', '#9C90A6', '#C8AE7A', '#9A5C40', '#8E957E', '#6E5440', '#C29A96'],
                                        trans_amt=0.15, rough=0.8, sheen=0.1, veins=0.05)
    M["MAT_Stem"] = W.mat_stem()
    M["MAT_Bark"] = W.mat_bark()
    M["MAT_Palm_Cane"] = W.mat_bark("MAT_Palm_Cane", base=('#5E6A3A', '#6E6A42'))
    M["MAT_Bulb_Skin"] = W.petal_mat("MAT_Bulb_Skin", ['#B58A58', '#C49A62', '#9E7444'], trans_amt=0.25, rough=0.6, sheen=0.3)
    M["MAT_Seed"] = W.mat_bark("MAT_Seed", base=('#3A2A1E', '#4A3426'))
    M["MAT_Moss"] = W.mat_moss()
    M["MAT_Hedge"] = W.mat_hedge()
    M["MAT_Conifer"] = W.mat_hedge("MAT_Conifer", palette=('#2C4A30', '#355636', '#223C28'), scale=260.0)
    M["MAT_Lawn"] = W.mat_lawn()
    M["MAT_Lawn_Distant"] = W.mat_lawn_distant()
    M["MAT_Soil"] = W.mat_soil()
    M["MAT_Gravel"] = W.mat_gravel()
    M["MAT_Pebble"] = W.mat_pebble()
    M["MAT_Wax"].cycles.emission_sampling = 'NONE'
    for name, kw in LOD.items():
        if name in M:
            W.apply_lod(M[name], **kw)
    return M


def _l(base, rough=0.5, metal=0.0, trans=0.0, tcol=None, glossy=False):
    return dict(base=base, rough=rough, metal=metal, trans=trans, trans_col=tcol, glossy=glossy)


# constant stand-ins used by bounce rays (see gh_materials.apply_lod)
LOD = {
    "MAT_CastIron": _l('#DDD6C7', 0.4), "MAT_Iron_Dark": _l('#242724', 0.45), "MAT_Iron_Grate": _l('#2C2723', 0.6),
    "MAT_Steel_Tool": _l('#7E7C78', 0.35, 1.0), "MAT_Copper": _l('#86947A', 0.5, 0.4), "MAT_Copper_Polished": _l('#C98458', 0.25, 1.0),
    "MAT_Copper_Roof": _l('#6E9E8A', 0.6), "MAT_Copper_Utensil": _l('#B06A44', 0.35, 1.0), "MAT_Brass": _l('#C89848', 0.3, 1.0),
    "MAT_Galvanized": _l('#A2A7A8', 0.35, 0.8),
    "MAT_Stone_Flag": _l('#9C9180', 0.55), "MAT_Stone_Slate": _l('#3A3E42', 0.45), "MAT_Stone_Coping": _l('#ADA390', 0.6),
    "MAT_Stone_Rough": _l('#7C7467', 0.7), "MAT_Brick": _l('#93503A', 0.8), "MAT_Mortar": _l('#B0A99A', 0.9),
    "MAT_Plaster": _l('#DAD2C0', 0.88), "MAT_Tile": _l('#ECE9E0', 0.1), "MAT_Tile_PorchIvory": _l('#E0D6BE', 0.3),
    "MAT_Tile_PorchBlack": _l('#242220', 0.3), "MAT_Tile_Roof": _l('#8E4E36', 0.8), "MAT_Marble": _l('#E8E5E0', 0.1),
    "MAT_Terracotta": _l('#B56A44', 0.8), "MAT_Ceramic_Glazed": _l('#9FA894', 0.1), "MAT_Porcelain": _l('#F2EFE8', 0.08),
    "MAT_Porcelain_Sink": _l('#EAE6DD', 0.1),
    "MAT_Wood_Floor": _l('#6E5038', 0.5), "MAT_Wood_Furniture": _l('#8A6544', 0.42), "MAT_Wood_Structure": _l('#463224', 0.7),
    "MAT_Wood_PaintedCream": _l('#E2DCCD', 0.4), "MAT_Wood_PaintedSage": _l('#7A886E', 0.45), "MAT_Wood_Weathered": _l('#857C6E', 0.8),
    "MAT_Bamboo": _l('#C1AA72', 0.4), "MAT_Wicker": _l('#AD8D60', 0.6),
    "MAT_Linen": _l('#D6CBB7', 0.85, trans=0.15), "MAT_Linen_Stripe": _l('#CFC5B2', 0.85, trans=0.15), "MAT_Linen_Rug": _l('#A89A78', 0.9),
    "MAT_Linen_Sheer": _l('#E8DFCC', 0.85, trans=0.45), "MAT_Burlap": _l('#8C7350', 0.95), "MAT_Wool": _l('#7A4A38', 0.95),
    "MAT_Coir": _l('#7E5C36', 0.95), "MAT_Paper": _l('#E2D8C0', 0.8, trans=0.25), "MAT_Paper_Kraft": _l('#AE885A', 0.75, trans=0.15),
    "MAT_Paper_Book": _l('#EAE1CA', 0.8, trans=0.3), "MAT_Paper_News": _l('#D4CFC0', 0.8, trans=0.2), "MAT_Paper_SeedLabel": _l('#D8CDB2', 0.7),
    "MAT_Twine": _l('#A6875C', 0.9), "MAT_Leather": _l('#6A402A', 0.5), "MAT_Rubber": _l('#323C2C', 0.5), "MAT_Wax": _l('#F2E9D5', 0.35),
    "MAT_Leaf_Fern": _l('#5A8A2E', 0.5, trans=0.38, tcol='#9CCB4A'), "MAT_Leaf_Ivy": _l('#33521F', 0.3, trans=0.25, tcol='#6E9A2E'),
    "MAT_Leaf_Broad": _l('#4A7430', 0.45, trans=0.3, tcol='#86B040'), "MAT_Leaf_Hosta": _l('#56783E', 0.42, trans=0.28, tcol='#8CB04A'),
    "MAT_Leaf_Hydrangea": _l('#42702A', 0.48, trans=0.3, tcol='#80AE3E'), "MAT_Leaf_Geranium": _l('#517C33', 0.55, trans=0.3, tcol='#8AB446'),
    "MAT_Leaf_LilyPad": _l('#33582F', 0.25, trans=0.12, tcol='#6E9A3A'), "MAT_Leaf_Seedling": _l('#88C24F', 0.38, trans=0.45, tcol='#BFE878'),
    "MAT_Leaf_Tree": _l('#456828', 0.5, trans=0.32, tcol='#86B040'), "MAT_Leaf_Herb": _l('#788A64', 0.65, trans=0.25, tcol='#A8BA88'),
    "MAT_Leaf_Palm": _l('#36592A', 0.32, trans=0.3, tcol='#74A040'), "MAT_Leaf_Orchid": _l('#365E2E', 0.25, trans=0.15, tcol='#6E9A3A'),
    "MAT_Leaf_Fallen": _l('#956434', 0.7, trans=0.2, tcol='#C89A50'),
    "MAT_Petal_Hydrangea": _l('#8484D0', 0.5, trans=0.4, tcol='#B8B0F0'), "MAT_Petal_Geranium": _l('#DA3D48', 0.5, trans=0.45, tcol='#FF7A80'),
    "MAT_Petal_Orchid": _l('#F6EEF0', 0.5, trans=0.45, tcol='#FFF4F6'), "MAT_Petal_Rose": _l('#EDBFB4', 0.5, trans=0.42, tcol='#FFE0D4'),
    "MAT_Petal_Lavender": _l('#8672BA', 0.6, trans=0.3, tcol='#B4A2E2'), "MAT_Petal_Lily": _l('#F8E6EA', 0.5, trans=0.45, tcol='#FFF0F4'),
    "MAT_Petal_LilyStamen": _l('#EDB728', 0.6, trans=0.3, tcol='#FFD860'), "MAT_Dried_Flower": _l('#A48A78', 0.8, trans=0.15, tcol='#C8B098'),
    "MAT_Bulb_Skin": _l('#B08A58', 0.6, trans=0.25, tcol='#D8B080'),
    "MAT_Stem": _l('#56722F', 0.5, trans=0.2, tcol='#8AB050'), "MAT_Bark": _l('#544A40', 0.85), "MAT_Palm_Cane": _l('#646A3E', 0.8),
    "MAT_Seed": _l('#40301F', 0.8), "MAT_Moss": _l('#5A7426', 0.9, trans=0.15, tcol='#7FA030'),
    "MAT_Hedge": _l('#3E5A28', 0.5, trans=0.18, tcol='#6E9A2E'), "MAT_Conifer": _l('#2E4A30', 0.5, trans=0.18, tcol='#5E8A3A'),
    "MAT_Lawn": _l('#4E7229', 0.75), "MAT_Lawn_Distant": _l('#6A8040', 0.85), "MAT_Soil": _l('#3A2A1E', 0.85),
    "MAT_Gravel": _l('#A09684', 0.7), "MAT_Pebble": _l('#958C7E', 0.5),
}


# (original placeholder, object-name regex, new material)
RULES = [
    ("MAT_CastIron", r"^(Iron_(DomeLantern|WalkLantern|StreetLantern|PorchLantern|TeaLantern|HandLantern)|Iron_Basket|Iron_ParkBench|Iron_Gate|"
                     r"Iron_Umbrella|Iron_TrussBolt|Iron_DryingNail|Iron_TieStrap|Iron_WS|Iron_Bucket|Stem_OrchidClip)", "MAT_Iron_Dark"),
    ("MAT_CastIron", r"^Grate", "MAT_Iron_Grate"),
    ("MAT_CastIron", r"^CastIron_(Shear|Rake|Fork|Spade|Hoe|Tine|ToolFerrule|ToolCradle)", "MAT_Steel_Tool"),
    ("MAT_Galvanized", r"^(Iron_EavesGutter|Iron_Downpipe)", "MAT_CastIron"),
    ("MAT_Copper", r"^(Copper_LionNose|Copper_CanBail)", "MAT_Copper_Polished"),
    ("MAT_Copper", r"^(Copper_LanternCap|Copper_CapSeam)", "MAT_Copper_Roof"),
    ("MAT_Copper", r"^(Copper_Rose|Copper_Can|Copper_WateringCan|Copper_HandTool|Copper_CurvedTrowel|Copper_Sconce|Brazier_CopperBowl)", "MAT_Copper_Utensil"),
    ("MAT_Copper", r"^Grate", "MAT_Copper_Utensil"),
    ("MAT_Brick", r"^Brick_DadoCore", "MAT_Mortar"),
    ("MAT_Tile", r"^Tile_PorchDiamondIvory", "MAT_Tile_PorchIvory"),
    ("MAT_Tile", r"^Tile_PorchDiamondBlack", "MAT_Tile_PorchBlack"),
    ("MAT_Tile", r"^(Tile_PlainClay|Tile_RidgeCap)", "MAT_Tile_Roof"),
    ("MAT_Stone_Flag", r"^Stone_Flag_BotanicalSlate", "MAT_Stone_Slate"),
    ("MAT_Water", r"^Water_FountainBasin", "MAT_Water_Basin"),
    ("MAT_Water", r"^Water_Stream", "MAT_Water_Stream"),
    ("MAT_Water", r"^Water_Splash", "MAT_Water_Splash"),
    ("MAT_Water", r"^Water_TableVase", "MAT_Water_Vase"),
    ("MAT_Porcelain", r"^Porcelain_WS_DeepPorcelainSink", "MAT_Porcelain_Sink"),
    ("MAT_Lamp_Shade_Glass", r"^Glass_Sconce_OpalGlass", "MAT_Lamp_Opal_Glass"),
    ("MAT_Leaf_Broad", r"^Leaf_HostaClump", "MAT_Leaf_Hosta"),
    ("MAT_Leaf_Broad", r"^Leaf_LilyPad", "MAT_Leaf_LilyPad"),
    ("MAT_Leaf_Broad", r"^Leaf_Seedling", "MAT_Leaf_Seedling"),
    ("MAT_Leaf_Broad", r"^Leaf_DeciduousSprays", "MAT_Leaf_Tree"),
    ("MAT_Leaf_Broad", r"^Leaf_GeraniumReniform", "MAT_Leaf_Geranium"),
    ("MAT_Leaf_Broad", r"^Leaf_HydrangeaOpposite", "MAT_Leaf_Hydrangea"),
    ("MAT_Leaf_Broad", r"^(Leaf_Lavender|Leaf_RackHerb)", "MAT_Leaf_Herb"),
    ("MAT_Hedge", r"^Leaf_ConiferNeedleFans", "MAT_Conifer"),
    ("MAT_Lawn", r"^Lawn_DistantRidge", "MAT_Lawn_Distant"),
    ("MAT_Petal_Lily", r"^Petal_LilyStamen", "MAT_Petal_LilyStamen"),
    ("MAT_Bark", r"^Bark_LooseBulb", "MAT_Bulb_Skin"),
    ("MAT_Bark", r"^Bark_LooseSeed", "MAT_Seed"),
    ("MAT_Bark", r"^Stem_KentiaCane", "MAT_Palm_Cane"),
    ("MAT_Dried_Flower", r"^Leaf_Fallen", "MAT_Leaf_Fallen"),
    ("MAT_Paper", r"^Paper_WS_FieldGuideEtching", "MAT_Ink"),
    ("MAT_Paper", r"^(Paper_WS_Kraft|Paper_HalfWrapped|Paper_WS_UnfurledKraft|Paper_SeedEnvelope|Paper_EnvelopeFlap)", "MAT_Paper_Kraft"),
    ("MAT_Paper", r"^Paper_SeedLabel", "MAT_Paper_SeedLabel"),
    ("MAT_Paper", r"^Paper_WS_NewspaperFold", "MAT_Paper_News"),
    ("MAT_Paper", r"^(Paper_OpenBookFolio|Paper_WS_FieldGuidePaper|Paper_PocketVolumeLeaves)", "MAT_Paper_Book"),
    ("MAT_Linen", r"^Linen_WS_LinenWovenStripe", "MAT_Linen_Stripe"),
    ("MAT_Linen", r"^(Linen_RugFringe|Linen_WornDoorRug)", "MAT_Linen_Rug"),
    ("MAT_Linen", r"^(Linen_DeskLamp_LinenShade|Linen_HalfDrawnCurtain)", "MAT_Linen_Sheer"),
    ("MAT_Wood_Structure", r"^(Wood_Door|Wood_GlazingBar|Wood_FanlightBar|Wood_TransomBar)", "MAT_Wood_PaintedCream"),
    ("MAT_Wood_Structure", r"^(Wood_GardenDoor|Wood_PassageArch)", "MAT_Wood_PaintedSage"),
    ("MAT_Wood_Structure", r"^(Wood_BucketStave|Wood_Rack)", "MAT_Wood_Weathered"),
    ("MAT_Wood_Furniture", r"^(Wood_RackSlat|Wood_RackLeg|Wood_RackShelf)", "MAT_Wood_Weathered"),
    ("MAT_Wood_Structure", r"^Stem_OrchidStake", "MAT_Bamboo"),
]

COMPILED = [(a, re.compile(b), c) for a, b, c in RULES]


def set_slot(ob, idx, mat):
    slot = ob.material_slots[idx]
    if slot.material == mat:
        return
    slot.link = 'OBJECT'
    slot.material = mat


def colored_glass_choice(name):
    """Amber / pale-teal pattern in the lunette fanlights, porch fanlights, passage fan and the dome crown."""
    m = re.match(r"^Glass_FanPane_B(\d+)_S(\d)", name)
    if m:
        s = int(m.group(2))
        return {1: "A", 6: "A", 3: "T", 4: "T"}.get(s)
    m = re.match(r"^Glass_Fanlight_(Inner|Outer)(\d)", name)
    if m:
        return "A" if int(m.group(2)) % 2 == 0 else "T"
    if name.startswith("Glass_FanBoss"):
        return "A"
    m = re.match(r"^Glass_PassageFan(?:_(\d+))?", name)
    if m:
        k = int(m.group(1) or 0)
        return "A" if k % 2 == 0 else "T"
    m = re.match(r"^Glass_DomePane_R8_S(\d+)", name)
    if m:
        return "T" if int(m.group(1)) % 3 == 0 else "A"
    return None


EMIT_RULES = [
    (r"^(Lamp_DomeLantern|Lamp_CabinetCandlestick|Lamp_HandLantern|Lamp_PorchLantern)", "MAT_Emitter_Candidate"),
    (r"^(Lamp_Pendant|Lamp_DeskLamp|Lamp_Sconce)", "MAT_Emit_Bulb"),
    (r"^(Lamp_TeaLantern|Lamp_WalkLantern)", "MAT_Emit_Bulb_Gas"),
    (r"^Lamp_StreetLantern", "MAT_Emit_Bulb_Street"),
    (r"^Brazier_Fire", "MAT_Emit_Fire"),
    (r"^Stove_Fire", "MAT_Emit_Fire_Stove"),
]


def assign_all():
    stats = {}
    amber = M["MAT_Glass_Colored_Candidate"]
    teal = M["MAT_Glass_Colored_Teal"]
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for i, slot in enumerate(ob.material_slots):
            mat = slot.material
            if mat is None:
                continue
            mn = mat.name
            new = None
            if mn == "MAT_Emitter_Candidate":
                for pat, tgt in EMIT_RULES:
                    if re.match(pat, ob.name):
                        new = tgt
                        break
            elif mn == "MAT_Glass_Pane":
                c = colored_glass_choice(ob.name)
                if c == "A":
                    set_slot(ob, i, amber); stats["amber"] = stats.get("amber", 0) + 1
                    continue
                if c == "T":
                    set_slot(ob, i, teal); stats["teal"] = stats.get("teal", 0) + 1
                    continue
            else:
                for src, rx, tgt in COMPILED:
                    if src == mn and rx.match(ob.name):
                        new = tgt
                        break
            if new and new != mn:
                set_slot(ob, i, M[new])
                stats[new] = stats.get(new, 0) + 1
        # lamp glass never blocks its own light
        if any(s.material and s.material.name in ("MAT_Lamp_Shade_Glass", "MAT_Lamp_Opal_Glass") for s in ob.material_slots):
            ob.visible_shadow = False
    return stats
