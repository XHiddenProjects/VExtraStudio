# Vextra Studio – Blender add-on
# 1) LIVE LINK: Blender and the Vextra editor talk to each other. In Vextra (Assets → 3D Models → 🟠 Blender) you pull what you modelled in Blender into the game, send
#    models from the game to Blender, and turn on auto-sync so every edit in Blender shows up in the game by itself. The link is a tiny server on THIS computer only
#    (127.0.0.1) and every request needs the pairing key shown in the panel.
# 2) EXPORT: exports the scene (or the selection) as a game-ready .glb: skeletons, skinning, animations, morph targets and materials are kept,
#    optional Draco compression, textures limited in size, +Y up. Also reports a quick "game budget" (triangles, bones, textures).
#
# Install:  Blender → Edit → Preferences → Add-ons → Install… (Blender 4.2+: "Install from Disk…") → pick this file → tick "Vextra Studio".
# Use:      3D View → N panel → "Vextra" tab → "Start link", copy the key into Vextra. Or File → Export → Vextra game model (.glb).
bl_info = {
    "name": "Vextra Studio – game model export",
    "author": "Vextra Studio",
    "version": (1, 1, 0),
    "blender": (3, 6, 0),
    "location": "File > Export, and the 3D View sidebar (N) > Vextra",
    "description": "Live link with Vextra Studio (pull / push / auto-sync models) and one-click .glb export with skeletons, animations and optional Draco compression",
    "category": "Import-Export",
}

import os
import json
import queue
import secrets
import tempfile
import threading
import time
import hmac
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, EnumProperty, IntProperty, StringProperty
from bpy_extras.io_utils import ExportHelper


def _gltf_export(filepath, opts):
    """Calls Blender's glTF exporter; options that the running Blender version does not know are dropped one by one."""
    kw = dict(
        filepath=filepath,
        export_format="GLB",
        use_selection=opts["selected"],
        export_apply=opts["apply_modifiers"],
        export_animations=opts["animations"],
        export_skins=True,
        export_morph=True,
        export_yup=True,
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    if opts["draco"]:
        kw.update(export_draco_mesh_compression_enable=True,
                  export_draco_mesh_compression_level=opts["draco_level"],
                  export_draco_position_quantization=14,
                  export_draco_normal_quantization=10,
                  export_draco_texcoord_quantization=12)
    if opts["animations"]:
        kw.update(export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_range=False)
    for _ in range(len(kw) + 1):
        try:
            return bpy.ops.export_scene.gltf(**kw)
        except TypeError as e:
            # "keyword "xyz" unrecognized" – older / newer Blender: remove it and try again
            msg = str(e)
            bad = [k for k in list(kw) if '"%s"' % k in msg]
            if not bad:
                raise
            for k in bad:
                kw.pop(k, None)
    raise RuntimeError("glTF exporter rejected the options")


def _budget(selected_only):
    objs = [o for o in bpy.context.scene.objects if (o.select_get() or not selected_only)]
    deps = bpy.context.evaluated_depsgraph_get()
    tris = verts = bones = 0
    mats, imgs = set(), set()
    for o in objs:
        if o.type == "MESH":
            ev = o.evaluated_get(deps)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            verts += len(me.vertices)
            ev.to_mesh_clear()
            for s in o.material_slots:
                if s.material:
                    mats.add(s.material.name)
                    if s.material.use_nodes:
                        for n in s.material.node_tree.nodes:
                            if n.type == "TEX_IMAGE" and n.image:
                                imgs.add(n.image)
        elif o.type == "ARMATURE":
            bones += len(o.data.bones)
    big = [i.name + " (%dx%d)" % tuple(i.size) for i in imgs if max(i.size) > 2048]
    clips = len(bpy.data.actions)
    return tris, verts, bones, len(mats), len(imgs), big, clips


class VEXTRA_OT_check(bpy.types.Operator):
    bl_idname = "vextra.check_budget"
    bl_label = "Check game budget"
    bl_description = "Counts triangles, bones, materials, textures and animation clips so you know what the model costs in a game"

    selected: BoolProperty(default=False)

    def execute(self, context):
        tris, verts, bones, mats, imgs, big, clips = _budget(self.selected)
        msg = "%s triangles · %s vertices · %d bones · %d materials · %d textures · %d animation clips" % (format(tris, ","), format(verts, ","), bones, mats, imgs, clips)
        self.report({"INFO"}, msg)
        if tris > 100000:
            self.report({"WARNING"}, "Over 100,000 triangles – consider decimating for mobile / web games")
        if bones > 80:
            self.report({"WARNING"}, "Over 80 bones – phones may struggle with skinned models this heavy")
        if big:
            self.report({"WARNING"}, "Textures larger than 2048 px: " + ", ".join(big[:4]))
        return {"FINISHED"}



# ───────────────────────────── live link (local server) ─────────────────────────────
ADDON_VERSION = "1.1.0"
_jobs = queue.Queue()
_srv = {"httpd": None, "thread": None, "port": 0, "rev": 0, "last": 0.0}


def _pump():
    """Runs on Blender's main thread: executes the work the HTTP thread asked for (bpy must only be used here)."""
    for _ in range(8):
        try:
            fn, box, done = _jobs.get_nowait()
        except queue.Empty:
            break
        try:
            box["ok"] = fn()
        except Exception as e:  # reported back to Vextra
            box["err"] = str(e) or e.__class__.__name__
        done.set()
    return 0.05


def _on_main(fn, timeout=90):
    box, done = {}, threading.Event()
    _jobs.put((fn, box, done))
    if not done.wait(timeout):
        raise TimeoutError("Blender did not answer in time (is it busy or showing a dialog?)")
    if "err" in box:
        raise RuntimeError(box["err"])
    return box["ok"]


@persistent
def _on_depsgraph(scene, depsgraph=None):
    """Any real change (geometry, transform, material, animation) bumps the revision that Vextra watches for auto-sync."""
    if time.time() < _srv.get("mute", 0):
        return
    try:
        dg = depsgraph or bpy.context.evaluated_depsgraph_get()
        for u in dg.updates:
            if u.is_updated_geometry or u.is_updated_transform or u.is_updated_shading:
                _srv["rev"] += 1
                _srv["last"] = time.time()
                return
    except Exception:
        pass


def _objects_with_rigs(objs):
    out, seen = [], set()

    def add(o):
        if o and o.name not in seen:
            seen.add(o.name)
            out.append(o)

    for o in objs:
        add(o)
        if o.type == "MESH":
            for m in o.modifiers:
                if m.type == "ARMATURE":
                    add(m.object)
            if o.parent and o.parent.type == "ARMATURE":
                add(o.parent)
    return out


def _find_collection(asset_id):
    for c in bpy.data.collections:
        if c.get("vextra_asset") == asset_id:
            return c
    return None


def _resolve(spec):
    """spec: {"objects":[names]} | {"collection":name} | {"asset":id} | {"scene":true} | {"selection":true}"""
    sc = bpy.context.scene
    if spec.get("objects"):
        objs = [bpy.data.objects[n] for n in spec["objects"] if n in bpy.data.objects]
    elif spec.get("asset"):
        c = _find_collection(spec["asset"])
        if not c:
            raise RuntimeError("The model that was sent from Vextra is no longer in this Blender file (its “Vextra:” collection was deleted)")
        objs = list(c.all_objects)
    elif spec.get("collection"):
        c = bpy.data.collections.get(spec["collection"])
        if not c:
            raise RuntimeError("No collection called “%s”" % spec["collection"])
        objs = list(c.all_objects)
    elif spec.get("selection"):
        objs = [o for o in bpy.context.view_layer.objects if o.select_get()]
    else:
        objs = [o for o in sc.objects if o.type in ("MESH", "ARMATURE", "CURVE", "SURFACE", "META", "FONT", "EMPTY")]
    objs = [o for o in _objects_with_rigs(objs) if o.name in bpy.context.view_layer.objects]
    objs = [o for o in objs if not o.hide_get() and o.visible_get()]
    if not objs:
        raise RuntimeError("Nothing to export – select something visible in Blender first")
    return objs


def _scene_info():
    sc = bpy.context.scene
    sel = [o.name for o in bpy.context.view_layer.objects if o.select_get()]
    cols = [{"name": c.name, "count": len(c.all_objects), "asset": c.get("vextra_asset", "")} for c in bpy.data.collections if len(c.all_objects)]
    objs = [{"name": o.name, "type": o.type, "sel": o.name in sel} for o in sc.objects][:400]
    tris, verts, bones, mats, imgs, big, clips = _budget(False)
    return {"file": os.path.basename(bpy.data.filepath) or "(unsaved)", "scene": sc.name, "selected": sel, "collections": cols, "objects": objs,
            "budget": {"tris": tris, "verts": verts, "bones": bones, "materials": mats, "textures": imgs, "clips": clips, "bigTextures": big},
            "mode": bpy.context.mode}


def _export_glb(spec, opts):
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Blender is in %s – switch back to Object Mode so Vextra can read the model" % bpy.context.mode.replace("_", " ").title())
    objs = _resolve(spec)
    vl = bpy.context.view_layer
    was_sel = [o for o in vl.objects if o.select_get()]
    was_act = vl.objects.active
    path = os.path.join(tempfile.gettempdir(), "vextra_%d.glb" % int(time.time() * 1000))
    try:
        for o in was_sel:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        vl.objects.active = objs[0]
        _gltf_export(path, dict(selected=True, apply_modifiers=opts.get("modifiers", True), animations=opts.get("animations", True),
                                draco=opts.get("draco", False), draco_level=int(opts.get("draco_level", 6))))
        with open(path, "rb") as f:
            data = f.read()
    finally:
        for o in objs:
            o.select_set(False)
        for o in was_sel:
            try:
                o.select_set(True)
            except Exception:
                pass
        if was_act:
            vl.objects.active = was_act
        if os.path.exists(path):
            os.remove(path)
    return data, [o.name for o in objs]


def _import_model(data, ext, name, asset_id):
    """Puts a model that came from Vextra into a collection called “Vextra: <name>” (replacing the previous copy of the same asset)."""
    path = os.path.join(tempfile.gettempdir(), "vextra_in_%d.%s" % (int(time.time() * 1000), ext))
    with open(path, "wb") as f:
        f.write(data)
    try:
        old = _find_collection(asset_id) if asset_id else None
        keep_name = None
        if old:
            keep_name = old.name
            datas = []
            for o in list(old.all_objects):
                if o.data is not None:
                    datas.append(o.data)
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(old)
            for d in datas:
                try:
                    if d.users == 0:
                        (bpy.data.meshes if isinstance(d, bpy.types.Mesh) else bpy.data.armatures).remove(d)
                except Exception:
                    pass
        before = set(bpy.data.objects)
        if ext in ("glb", "gltf"):
            bpy.ops.import_scene.gltf(filepath=path)
        elif ext == "obj":
            if hasattr(bpy.ops.wm, "obj_import"):
                bpy.ops.wm.obj_import(filepath=path)
            else:
                bpy.ops.import_scene.obj(filepath=path)
        else:
            raise RuntimeError("Blender cannot read .%s models from Vextra" % ext)
        new = [o for o in bpy.data.objects if o not in before]
        if not new:
            raise RuntimeError("The model contained nothing Blender could import")
        coll = bpy.data.collections.new(keep_name or ("Vextra: " + name))
        coll["vextra_asset"] = asset_id or ""
        bpy.context.scene.collection.children.link(coll)
        for o in new:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            coll.objects.link(o)
        _srv["mute"] = time.time() + 2.5  # the import itself must not make Vextra pull the model straight back
        return {"collection": coll.name, "objects": [o.name for o in new]}
    finally:
        if os.path.exists(path):
            os.remove(path)


def _prefs():
    return bpy.context.preferences.addons[__name__].preferences


class _Handler(BaseHTTPRequestHandler):
    server_version = "VextraBlender/" + ADDON_VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Vextra-Key, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Expose-Headers", "X-Vextra-Objects, X-Vextra-Rev")
        self.send_header("Access-Control-Max-Age", "600")

    def _send(self, code, body, ctype="application/json", extra=None):
        if not isinstance(body, (bytes, bytearray)):
            body = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def _authorized(self):
        key = _srv.get("key", "")
        return bool(key) and hmac.compare_digest(self.headers.get("X-Vextra-Key", ""), key)

    def _handle(self, method):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        body = b""
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            if n > 200 * 1024 * 1024:
                return self._send(413, {"error": "model is over 200 MB"})
            body = self.rfile.read(n)
        if u.path == "/ping":
            ok = self._authorized()
            info = {"ok": True, "app": "vextra-blender", "addon": ADDON_VERSION, "blender": ".".join(map(str, bpy.app.version)), "authorized": ok}
            if ok:
                info.update(rev=_srv["rev"], idle=round(time.time() - _srv["last"], 2) if _srv["last"] else 99, playing=bool(getattr(bpy.context.screen, "is_animation_playing", False)) if bpy.context.screen else False)
            return self._send(200, info)
        if not self._authorized():
            return self._send(401, {"error": "Wrong or missing key. Copy the key from Blender’s Vextra panel into Vextra’s Blender window."})
        try:
            if u.path == "/scene":
                return self._send(200, _on_main(_scene_info))
            if u.path == "/export":
                spec = json.loads(q.get("spec") or "{}")
                opts = json.loads(q.get("opts") or "{}")
                data, names = _on_main(lambda: _export_glb(spec, opts))
                return self._send(200, data, "model/gltf-binary", {"X-Vextra-Objects": urllib.parse.quote(json.dumps(names)), "X-Vextra-Rev": str(_srv["rev"])})
            if u.path == "/import" and method == "POST":
                res = _on_main(lambda: _import_model(body, q.get("ext", "glb"), q.get("name", "model"), q.get("asset", "")))
                return self._send(200, res)
            if u.path == "/save" and method == "POST":
                _on_main(lambda: bpy.ops.wm.save_mainfile())
                return self._send(200, {"ok": True})
            return self._send(404, {"error": "unknown request " + u.path})
        except Exception as e:
            code = 409 if "Object Mode" in str(e) else 500
            return self._send(code, {"error": str(e) or e.__class__.__name__})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


def link_running():
    return _srv["httpd"] is not None


def start_link(port):
    if link_running():
        return
    p = _prefs()
    if not p.key:
        p.key = secrets.token_urlsafe(6)
    _srv["key"] = p.key
    httpd = ThreadingHTTPServer(("127.0.0.1", int(port)), _Handler)  # 127.0.0.1 only: nothing outside this computer can reach it
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    _srv.update(httpd=httpd, thread=t, port=int(port))
    if not bpy.app.timers.is_registered(_pump):
        bpy.app.timers.register(_pump, persistent=True)
    if _on_depsgraph not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(_on_depsgraph)


def stop_link():
    h = _srv.get("httpd")
    if h:
        h.shutdown()
        h.server_close()
    _srv.update(httpd=None, thread=None)
    if _on_depsgraph in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_on_depsgraph)
    if bpy.app.timers.is_registered(_pump):
        bpy.app.timers.unregister(_pump)


class VEXTRA_OT_link(bpy.types.Operator):
    bl_idname = "vextra.link_toggle"
    bl_label = "Start / stop the Vextra link"
    bl_description = "Lets Vextra Studio (on this computer) read models from this Blender and send models to it"

    def execute(self, context):
        try:
            if link_running():
                stop_link()
                self.report({"INFO"}, "Vextra link stopped")
            else:
                start_link(_prefs().port)
                self.report({"INFO"}, "Vextra link running on 127.0.0.1:%d – paste the key into Vextra → Assets → 3D Models → Blender" % _srv["port"])
        except OSError as e:
            self.report({"ERROR"}, "Could not start the link on port %d (%s). Pick another port in the add-on preferences." % (_prefs().port, e))
            return {"CANCELLED"}
        return {"FINISHED"}


class VEXTRA_OT_copykey(bpy.types.Operator):
    bl_idname = "vextra.copy_key"
    bl_label = "Copy key"
    bl_description = "Copies the pairing key to the clipboard"

    def execute(self, context):
        context.window_manager.clipboard = _prefs().key
        self.report({"INFO"}, "Key copied – paste it into Vextra")
        return {"FINISHED"}


class VEXTRA_OT_newkey(bpy.types.Operator):
    bl_idname = "vextra.new_key"
    bl_label = "New key"
    bl_description = "Makes a new pairing key (the old one stops working)"

    def execute(self, context):
        p = _prefs()
        p.key = secrets.token_urlsafe(6)
        _srv["key"] = p.key
        return {"FINISHED"}


def _opts(self):
    return dict(selected=self.selected, apply_modifiers=self.apply_modifiers, animations=self.animations, draco=self.draco, draco_level=self.draco_level)


class EXPORT_OT_vextra(bpy.types.Operator, ExportHelper):
    bl_idname = "export_scene.vextra"
    bl_label = "Export Vextra game model"
    bl_description = "Export a .glb for Vextra Studio"
    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})
    selected: BoolProperty(name="Selected objects only", default=False)
    apply_modifiers: BoolProperty(name="Apply modifiers", default=True)
    animations: BoolProperty(name="Animations", default=True, description="Export every action (walk, run, idle…) as a clip the Model Animation block can play")
    draco: BoolProperty(name="Draco compression", default=True, description="Makes the file 5–10x smaller; Vextra decodes it automatically")
    draco_level: IntProperty(name="Compression level", default=6, min=0, max=10)

    def execute(self, context):
        _gltf_export(self.filepath, _opts(self))
        self.report({"INFO"}, "Saved %s – in Vextra: Assets → Models → Import" % os.path.basename(self.filepath))
        return {"FINISHED"}


class VEXTRA_OT_quick(bpy.types.Operator):
    bl_idname = "vextra.quick_export"
    bl_label = "Export to Vextra folder"
    bl_description = "Exports next to your Vextra project (folder set in the add-on preferences) using the .blend file name"
    selected: BoolProperty(name="Selected objects only", default=False)
    apply_modifiers: BoolProperty(name="Apply modifiers", default=True)
    animations: BoolProperty(name="Animations", default=True, description="Export every action (walk, run, idle…) as a clip the Model Animation block can play")
    draco: BoolProperty(name="Draco compression", default=True, description="Makes the file 5–10x smaller; Vextra decodes it automatically")
    draco_level: IntProperty(name="Compression level", default=6, min=0, max=10)

    def execute(self, context):
        prefs = context.preferences.addons[__name__].preferences
        folder = bpy.path.abspath(prefs.folder) if prefs.folder else (os.path.dirname(bpy.data.filepath) or os.path.expanduser("~"))
        name = os.path.splitext(os.path.basename(bpy.data.filepath))[0] or "model"
        path = os.path.join(folder, name + ".glb")
        os.makedirs(folder, exist_ok=True)
        _gltf_export(path, _opts(self))
        self.report({"INFO"}, "Saved " + path)
        return {"FINISHED"}


class VextraPrefs(bpy.types.AddonPreferences):
    bl_idname = __name__
    folder: StringProperty(name="Export folder", subtype="DIR_PATH", description="Where “Export to Vextra folder” puts the .glb (usually your Vextra project's folder)")
    port: IntProperty(name="Link port", default=7788, min=1024, max=65535, description="Port of the live link (127.0.0.1). Use the same number in Vextra")
    key: StringProperty(name="Pairing key", default="", description="Vextra must send this key with every request, so other programs and web pages cannot talk to your Blender")
    autostart: BoolProperty(name="Start the link when Blender starts", default=False)

    def draw(self, context):
        c = self.layout.column()
        c.prop(self, "port")
        r = c.row(align=True)
        r.prop(self, "key")
        r.operator("vextra.copy_key", text="", icon="COPYDOWN")
        r.operator("vextra.new_key", text="", icon="FILE_REFRESH")
        c.prop(self, "autostart")
        c.separator()
        c.prop(self, "folder")


class VEXTRA_PT_panel(bpy.types.Panel):
    bl_label = "Vextra Studio"
    bl_idname = "VEXTRA_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Vextra"

    def draw(self, context):
        lay = self.layout
        p = _prefs()
        box = lay.box()
        on = link_running()
        box.label(text=("Link running · port %d" % _srv["port"]) if on else "Link is off", icon="LINKED" if on else "UNLINKED")
        box.operator("vextra.link_toggle", text="Stop link" if on else "Start link", icon="PAUSE" if on else "PLAY")
        if on:
            r = box.row(align=True)
            r.label(text="Key: " + p.key)
            r.operator("vextra.copy_key", text="", icon="COPYDOWN")
            box.label(text="In Vextra: Assets → 3D Models → Blender")
        col = lay.column(align=True)
        col.operator("vextra.check_budget", icon="INFO").selected = False
        col.separator()
        col.operator("vextra.quick_export", icon="EXPORT")
        col.operator("export_scene.vextra", text="Export as…", icon="FILE_FOLDER")
        col.separator()
        col.label(text="Then in Vextra: Assets → Models → Import")


def _menu(self, context):
    self.layout.operator(EXPORT_OT_vextra.bl_idname, text="Vextra game model (.glb)")


_classes = (VEXTRA_OT_check, EXPORT_OT_vextra, VEXTRA_OT_quick, VextraPrefs, VEXTRA_OT_link, VEXTRA_OT_copykey, VEXTRA_OT_newkey, VEXTRA_PT_panel)


def _autostart():
    try:
        p = _prefs()
        if not p.key:
            p.key = secrets.token_urlsafe(6)
        if p.autostart and not link_running():
            start_link(p.port)
    except Exception:
        pass
    return None


def register():
    for c in _classes:
        bpy.utils.register_class(c)
    bpy.types.TOPBAR_MT_file_export.append(_menu)
    bpy.app.timers.register(_autostart, first_interval=1.0)


def unregister():
    stop_link()
    bpy.types.TOPBAR_MT_file_export.remove(_menu)
    for c in reversed(_classes):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
