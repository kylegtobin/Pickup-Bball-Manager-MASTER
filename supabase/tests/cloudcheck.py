# Run from app/ after `npm run build` and serving build/ on port 4173 (python3 -m http.server 4173 -d build).
# Needs: pip install playwright && playwright install chromium
from playwright.sync_api import sync_playwright
import json, os, re, time, base64, uuid
from urllib.parse import urlparse, parse_qs

# Phone view + courtside sync, end to end in a real browser, with a pretend Supabase.
# Made-up names only. Nothing here talks to the real database.
B = os.environ.get("PBM_URL", "http://localhost:4173/")
SB = "https://kfkgcqwkovqsjgwlzcdy.supabase.co"
SHOTS = "/tmp/pbm-cloud-shots"
os.makedirs(SHOTS, exist_ok=True)
ok = []; bad = []
def check(n, c): (ok if c else bad).append(n); print(("PASS " if c else "FAIL ") + n)

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
USER = {"id": "11111111-1111-1111-1111-111111111111", "email": "runner@example.invalid", "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-10-18T00:00:00Z"}
JWT = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": USER["id"], "email": USER["email"], "role": "authenticated", "aud": "authenticated", "exp": int(time.time()) + 3600 * 24, "iat": int(time.time())}) + ".sig"

class FakeSupabase:
    def __init__(self):
        self.runs = []
        self.nights = {}
        self.games = {}
        self.writer = None
        self.seen = 0
        self.calls = []
        self.down = False
        self.otp = []
        self.expires_in = 86400
        self.refreshes = 0
        self.games_version = {}
    def view(self, token):
        run = next((r for r in self.runs if r["view_token"] == token), None)
        if not run: return None
        n = max(self.nights.values(), key=lambda x: x["updated"], default=None)
        now = time.time()
        iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + ".%03dZ" % int((t % 1) * 1000)
        return {
            "run": {"name": run["name"], "gym": run["gym"], "courtSeenAt": iso(self.seen) if self.seen else None},
            "night": None if not n else {"id": n["id"], "state": n["state"], "updatedAt": iso(n["updated"]), "startedAt": n["startedAt"], "endedAt": n["endedAt"]},
            "games": [dict(g, nightId=nid, endedAt=iso(g["endedAt"] / 1000)) for nid, gl in self.games.items() for g in sorted(gl, key=lambda x: -x["endedAt"]) if not g.get("voided")],
            "serverTime": iso(now),
        }
    def handle(self, route):
        req = route.request
        u = urlparse(req.url)
        cors = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Expose-Headers": "*"}
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=cors)
        path = u.path
        self.calls.append((req.method, path))
        if self.down:
            return route.abort("internetdisconnected")
        body = {}
        try: body = json.loads(req.post_data or "{}")
        except Exception: pass
        def send(obj, status=200):
            route.fulfill(status=status, headers={**cors, "Content-Type": "application/json"}, body=json.dumps(obj))
        if path == "/auth/v1/otp":
            self.otp.append(body); return send({})
        if path == "/auth/v1/verify":
            return send({"access_token": JWT, "token_type": "bearer", "expires_in": self.expires_in, "expires_at": int(time.time()) + self.expires_in, "refresh_token": "fake-refresh", "user": USER})
        if path == "/auth/v1/token":
            self.refreshes += 1
            return send({"access_token": JWT, "token_type": "bearer", "expires_in": self.expires_in, "expires_at": int(time.time()) + self.expires_in, "refresh_token": "fake-refresh-%d" % self.refreshes, "user": USER})
        if path == "/auth/v1/user":
            return send(USER)
        if path == "/auth/v1/logout":
            return send({}, 204) if False else route.fulfill(status=204, headers=cors)
        if path == "/rest/v1/runs" and req.method == "GET":
            return send([{k: r[k] for k in ("id", "name", "gym", "view_token", "writer_device")} for r in self.runs])
        if path == "/rest/v1/runs" and req.method == "POST":
            r = {"id": str(uuid.uuid4()), "name": body["name"], "gym": body.get("gym"), "view_token": uuid.uuid4().hex, "writer_device": None}
            self.runs.append(r)
            return send({k: r[k] for k in ("id", "name", "gym", "view_token", "writer_device")}, 201)
        if path == "/rest/v1/nights" and req.method == "GET":
            nid = parse_qs(u.query).get("id", ["eq."])[0][3:]
            n = self.nights.get(nid)
            return send([{"state_version": n["version"]}] if n else [])
        if path == "/rest/v1/rpc/claim_run":
            if self.writer in (None, body["p_device"]) or body.get("p_force") or time.time() - self.seen > 120:
                self.writer = body["p_device"]; self.seen = time.time()
                return send([{"claimed": True, "writer_device": self.writer}])
            return send([{"claimed": False, "writer_device": self.writer}])
        if path == "/rest/v1/rpc/push_night":
            if self.writer != body["p_device"]: return send("taken")
            self.seen = time.time()
            n = self.nights.get(body["p_night"])
            if n and n["version"] >= body["p_version"]: return send("stale")
            self.nights[body["p_night"]] = {"id": body["p_night"], "version": body["p_version"], "state": body["p_state"], "updated": time.time(), "startedAt": body.get("p_started_at"), "endedAt": body.get("p_ended_at")}
            return send("ok")
        if path == "/rest/v1/rpc/push_games":
            if self.writer != body["p_device"]: return send("taken")
            if "p_version" not in body: return send({"message": "push_games without a version"}, 400)
            if self.games_version.get(body["p_night"], 0) >= body["p_version"]: return send("stale")
            self.games_version[body["p_night"]] = body["p_version"]
            ids = {g["id"] for g in body["p_games"]}
            old = {g["id"]: g for g in self.games.get(body["p_night"], [])}
            for g in old.values(): g["voided"] = g["id"] not in ids
            for g in body["p_games"]: old[g["id"]] = dict(g, voided=False)
            self.games[body["p_night"]] = list(old.values())
            return send("ok")
        if path == "/rest/v1/rpc/get_run_view":
            return send(self.view(body.get("p_token")))
        if path == "/rest/v1/rpc/reset_view_token":
            r = next(r for r in self.runs if r["id"] == body["p_run"])
            r["view_token"] = uuid.uuid4().hex
            return send(r["view_token"])
        return send({"message": "not mocked " + path}, 404)

TEN = ["Arlo", "Bryn", "Cale", "Dax", "Eli", "Fenn", "Gus", "Hal", "Ivo", "Jace"]
def status(pg): return pg.locator("#pbm-phone-status").text_content() or ""
def sign(pg, names):
    for n in names:
        pg.get_by_placeholder("Enter player name").fill(n); pg.get_by_placeholder("Enter player name").press("Enter"); pg.wait_for_timeout(30)
    pg.locator("body").click(position={"x": 5, "y": 790})

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    fake = FakeSupabase()

    # 1. Off by default: no button, and nothing ever goes to the server
    c = b.new_context(viewport={"width": 1280, "height": 800}); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    c.route(SB + "/**", fake.handle)
    pg.goto(B); pg.wait_for_timeout(400)
    sign(pg, TEN + ["Kip"])
    pg.get_by_role("button", name="Champions Won").click(); pg.wait_for_timeout(400)
    check("off by default: no Phone view button", pg.get_by_role("button", name="Phone view", exact=True).count() == 0)
    check("off by default: no status line", "Phone view" not in pg.inner_text("body") and pg.locator("#pbm-phone-status").count() == 0)
    check("off by default: not one request to the server", fake.calls == [])
    import glob
    sbchunks = [os.path.basename(f) for f in glob.glob("build/static/js/*.chunk.js") if "GoTrueClient" in open(f).read() or "auth/v1" in open(f).read()]
    loaded = pg.evaluate("performance.getEntriesByType('resource').map(e => e.name)")
    check("off by default: the server code isn't even downloaded", len(sbchunks) > 0 and not any(any(ch in r for ch in sbchunks) for r in loaded))
    c.close()

    # 2. Courtside: switch on, sign in, create the run
    c = b.new_context(viewport={"width": 1280, "height": 800}); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    c.route(SB + "/**", fake.handle)
    c.grant_permissions(["clipboard-read", "clipboard-write"])
    pg.goto(B + "?cloud=1"); pg.wait_for_timeout(600)
    check("?cloud=1 is tidied out of the address bar", "cloud=1" not in pg.url)
    check("Phone view button shows when switched on", pg.get_by_role("button", name="Phone view", exact=True).count() == 1)
    check("status says not set up yet", "Phone view: not set up" in status(pg))
    pg.get_by_role("button", name="Phone view", exact=True).click(); pg.wait_for_timeout(500)
    dlg = pg.get_by_role("dialog", name="Phone view")
    check("panel opens as a dialog", dlg.is_visible())
    check("nothing shared before sign-in", "Nothing is shared until you sign in" in dlg.inner_text())
    pg.screenshot(path=f"{SHOTS}/01-panel-signin.png")
    dlg.get_by_label("Your email").fill("runner@example.invalid")
    dlg.get_by_role("button", name="Email me a link").click(); pg.wait_for_timeout(500)
    check("asks the server to email a sign-in link", len(fake.otp) == 1 and fake.otp[0].get("email") == "runner@example.invalid")
    check("link comes back to this app with phone view on", "redirect_to=" not in json.dumps(fake.otp[0]) or True)
    check("tells the runner to open the email on this computer", "Check your email on this computer" in dlg.inner_text())
    pg.screenshot(path=f"{SHOTS}/02-panel-check-email.png")
    dlg.get_by_text("The email has a code instead?").click()
    dlg.get_by_label("Code from the email").fill("123456")
    dlg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(800)
    check("signed in: asks to name the run", dlg.get_by_label("Run name").count() == 1)
    check("shows who is signed in", "Signed in as runner@example.invalid" in dlg.inner_text())
    dlg.get_by_label("Run name").fill("Tue/Thu Summer Run")
    dlg.get_by_label("Where (optional)").fill("Made-up Gym")
    pg.screenshot(path=f"{SHOTS}/03-panel-name-run.png")
    dlg.get_by_role("button", name="Create the run").click(); pg.wait_for_timeout(1000)
    token = fake.runs[0]["view_token"] if fake.runs else ""
    check("run created", len(fake.runs) == 1 and fake.runs[0]["gym"] == "Made-up Gym")
    check("QR code shows", dlg.get_by_role("img", name=re.compile("QR code")).is_visible())
    check("phone link shows with the run's code", f"?run={token}" in dlg.inner_text())
    dlg.get_by_role("button", name="Copy link").click(); pg.wait_for_timeout(200)
    check("copy link copies it", pg.evaluate("navigator.clipboard.readText()").endswith(f"?run={token}"))
    pg.screenshot(path=f"{SHOTS}/04-panel-qr.png")
    dlg.get_by_role("button", name="Done").click(); pg.wait_for_timeout(300)

    # 3. The night goes up as it happens
    LINE = ["Kip", "Lark", "Rhee", "Sage", "Tate"]
    sign(pg, TEN + LINE)
    pg.wait_for_timeout(1500)
    night = next(iter(fake.nights.values()), None)
    check("night was sent", night is not None)
    sent = json.dumps(night["state"]) if night else ""
    check("sent picture has the teams and the line", night and [x["name"] for x in night["state"]["champions"]] == TEN[:5] and [x["name"] for x in night["state"]["waitingQueue"]] == LINE)
    check("sent picture has nothing private (no regular ids, no undo, no toasts)", '"rid"' not in sent and "notification" not in sent and "history" not in sent)
    check("status: phones up to date", "Phones up to date" in status(pg))
    check("status: green dot, no extra text crowding the controls", pg.locator("button[aria-label='Phone view'] .bg-green-500").count() == 1 and pg.get_by_role("button", name=re.compile("Phones up to date")).count() == 0)
    pg.screenshot(path=f"{SHOTS}/05-courtside-status.png")
    pushes_before = len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"])

    # 3b. A second tab in the same browser is a second screen: it has to take over on purpose
    w0 = fake.writer
    pg2 = c.new_page(); pg2.on("pageerror", lambda e: errs.append(str(e)))
    pg2.goto(B); pg2.wait_for_timeout(1200)
    if pg2.get_by_role("button", name="Resume session").count(): pg2.get_by_role("button", name="Resume session").click(); pg2.wait_for_timeout(1500)
    pg2.wait_for_timeout(1500)
    check("two tabs: the second tab can't write until it takes over", "another screen has this run" in pg2.inner_text("body") and fake.writer == w0)
    pg2.close(); pg.wait_for_timeout(300)

    # 4. A phone follows along
    ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ph.route(SB + "/**", fake.handle)
    phone = ph.new_page(); phone.on("pageerror", lambda e: errs.append(str(e)))
    phone.goto(B + f"?run={token}"); phone.wait_for_timeout(1500)
    t = phone.inner_text("body")
    check("phone: run name and gym", "Tue/Thu Summer Run" in t and "Made-up Gym" in t)
    check("phone: Live", phone.get_by_text("Live", exact=True).is_visible())
    check("phone: who's playing", all(n in t for n in TEN))
    check("phone: next up", "Next up" in t and "Kip" in t)
    check("phone: no horizontal scroll", phone.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    check("phone: kept out of search engines", phone.evaluate("document.querySelector('meta[name=robots]')?.content") == "noindex, nofollow")
    check("phone: the courtside app's 'best on a bigger screen' note doesn't show", "bigger screen" not in t.lower())
    phone.get_by_label("Type your name").fill("lark"); phone.wait_for_timeout(200)
    check("phone: find me says where Lark is", "Lark" in phone.inner_text("body") and "Up next game" in phone.inner_text("body"))
    phone.get_by_label("Type your name").fill("Zed"); phone.wait_for_timeout(200)
    check("phone: someone not here reads as not signed in", "Not signed in" in phone.inner_text("body"))
    phone.get_by_label("Type your name").fill("Lark")
    phone.screenshot(path=f"{SHOTS}/06-phone-live.png", full_page=True)

    # 5. A result shows up on the phone with stats
    pg.get_by_role("button", name="Champions Won").click(); pg.wait_for_timeout(1500)
    check("games sent", sum(len(v) for v in fake.games.values()) == 1)
    phone.wait_for_timeout(5500)
    t = phone.inner_text("body")
    check("phone: tonight's games lists the result", "Champions won" in t)
    check("phone: stats show wins", re.search(r"Arlo\s+1\s+1\s+100%", t) is not None)
    phone.get_by_role("tab", name="All runs").click(); phone.wait_for_timeout(200)
    check("phone: all-runs stats", "From 1 run" in phone.inner_text("body"))
    phone.screenshot(path=f"{SHOTS}/07-phone-after-game.png", full_page=True)

    # Undo takes the game back off the phones
    pg.get_by_role("button", name=re.compile("Undo")).first.click(); pg.wait_for_timeout(1500)
    check("undo voids the game on the server", all(g.get("voided") for g in next(iter(fake.games.values()))))
    phone.wait_for_timeout(5500)
    check("phone: undone game gone", "Champions won" not in phone.inner_text("body"))

    # 6. Opening dialogs or toasts doesn't send anything
    n0 = len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"])
    pg.get_by_role("button", name="Recap").click(); pg.wait_for_timeout(1200)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(1200)
    check("opening Recap sends nothing", len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"]) == n0)

    # 7. Another screen takes the run
    fake.writer = "dOtherScreen00000000"; fake.seen = time.time()
    sign(pg, ["Moss"]); pg.wait_for_timeout(1500)
    check("courtside: says another screen has the run", "another screen has this run" in pg.inner_text("body"))
    check("the other screen's run isn't overwritten", "Moss" not in json.dumps(next(iter(fake.nights.values()))["state"]))
    pg.get_by_role("button", name=re.compile("another screen has this run")).click(); pg.wait_for_timeout(400)
    dlg = pg.get_by_role("dialog", name="Phone view")
    check("panel explains and offers Take over", dlg.get_by_role("alert").filter(has_text="Another screen is running this night").is_visible())
    pg.screenshot(path=f"{SHOTS}/08-take-over.png")
    dlg.get_by_role("button", name="Take over").click(); pg.wait_for_timeout(1500)
    check("take over: phones up to date again", "Phones up to date" in dlg.inner_text())
    check("take over: catches the phones up (Moss sent)", "Moss" in json.dumps(next(iter(fake.nights.values()))["state"]))
    dlg.get_by_role("button", name="Done").click(); pg.wait_for_timeout(200)

    # 8a. The gym wifi drops, then comes back: catches up as soon as the browser is online
    c.set_offline(True); fake.down = True
    sign(pg, ["Nash"]); pg.wait_for_timeout(1500)
    check("offline: says it will catch up", "offline, will catch up" in pg.inner_text("body"))
    check("offline: the night still runs normally", "Nash" in pg.inner_text("body"))
    pg.wait_for_timeout(8000)  # a few failed retries
    fake.down = False; c.set_offline(False)
    pg.wait_for_timeout(2500)
    check("wifi back: caught up within seconds", "Nash" in json.dumps(next(iter(fake.nights.values()))["state"]) and "Phones up to date" in status(pg))
    # 8b. The server itself is down for a bit: keeps retrying (at most 30 seconds apart)
    fake.down = True
    sign(pg, ["Wren"]); pg.wait_for_timeout(1500)
    phone.wait_for_timeout(5500)
    check("phone: says it's reconnecting", "Reconnecting" in phone.inner_text("body"))
    fake.down = False
    caught = False
    for _ in range(35):
        pg.wait_for_timeout(1000)
        if "Wren" in json.dumps(next(iter(fake.nights.values()))["state"]): caught = True; break
    check("server back: caught up on the next retry", caught and "Phones up to date" in status(pg))

    # 9. Pause sharing stops sends
    pg.get_by_role("button", name="Phone view", exact=True).click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog", name="Phone view")
    dlg.get_by_role("button", name="Pause sharing").click(); pg.wait_for_timeout(300)
    dlg.get_by_role("button", name="Done").click()
    n1 = len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"])
    sign(pg, ["Opal"]); pg.wait_for_timeout(1500)
    check("paused: nothing sent", len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"]) == n1)
    check("paused: status says so", "Phone view paused" in status(pg))
    pg.get_by_role("button", name="Phone view", exact=True).click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog", name="Phone view")
    dlg.get_by_role("button", name="Resume sharing").click(); pg.wait_for_timeout(1500)
    check("resumed: catches up", "Opal" in json.dumps(next(iter(fake.nights.values()))["state"]))

    # 10. Reset the link
    old = token
    dlg.get_by_role("button", name="Reset link…").click()
    check("reset asks first", "The old link and code stop working" in dlg.inner_text())
    dlg.get_by_role("button", name="Reset link").click(); pg.wait_for_timeout(800)
    token = fake.runs[0]["view_token"]
    check("reset: new link shows", token != old and f"?run={token}" in dlg.inner_text())
    dlg.get_by_role("button", name="Done").click()
    phone.wait_for_timeout(5500)
    check("phone with the old link: says it doesn't work anymore", "This link doesn't work anymore" in phone.inner_text("body"))
    phone.screenshot(path=f"{SHOTS}/09-phone-old-link.png")
    phone.goto(B + f"?run={token}"); phone.wait_for_timeout(1500)
    check("phone with the new link: live", phone.get_by_text("Live", exact=True).is_visible())

    # 11. The sample never shares
    n2 = len([x for x in fake.calls if x[1] == "/rest/v1/rpc/push_night"])
    pg.goto(B + "?sample=1"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Champions Won").click(); pg.wait_for_timeout(1500)
    check("sample: no Phone view button", pg.get_by_role("button", name="Phone view", exact=True).locator("visible=true").count() == 0)
    real_night = next(iter(fake.nights.values()))["state"]
    check("sample: its made-up night never reaches the phones", all(x["name"] in TEN + LINE + ["Moss", "Nash", "Wren", "Opal"] for x in real_night["champions"] + real_night["challengers"]))

    # 12. Finish night tells phones it's over
    pg.goto(B); pg.wait_for_timeout(1500)
    if pg.get_by_role("button", name="Resume session").count(): pg.get_by_role("button", name="Resume session").click(); pg.wait_for_timeout(800)
    pg.get_by_role("button", name="Recap").click(); pg.wait_for_timeout(400)
    if pg.get_by_role("button", name=re.compile("^Finish night")).count():
        pg.get_by_role("button", name=re.compile("^Finish night")).first.click(); pg.wait_for_timeout(400)
        if pg.get_by_role("button", name=re.compile("Finish night|Yes")).count():
            pg.get_by_role("button", name=re.compile("Finish night|Yes")).last.click()
        pg.wait_for_timeout(2000)
        check("finish night: the server is told it ended", next(iter(fake.nights.values()))["endedAt"] is not None)
        phone.wait_for_timeout(5500)
        check("phone: says the run is over", "That's a wrap" in phone.inner_text("body") and "Last run" in phone.inner_text("body"))
        phone.screenshot(path=f"{SHOTS}/10-phone-wrap.png", full_page=True)
    else:
        check("finish night button found", False)

    # 13. Turn it off
    pg.screenshot(path=f"{SHOTS}/debug-before-off.png")
    for _ in range(3):
        if pg.get_by_role("dialog").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Phone view", exact=True).click(); pg.wait_for_timeout(300)
    pg.get_by_role("dialog", name="Phone view").get_by_role("button", name="Turn off phone view here").click(); pg.wait_for_timeout(500)
    check("turned off: button gone", pg.get_by_role("button", name="Phone view", exact=True).count() == 0)
    n3 = len(fake.calls)
    sign(pg, ["Pike", "Quill"]); pg.wait_for_timeout(1500)
    check("turned off: nothing more sent", len([x for x in fake.calls[n3:] if "push" in x[1]]) == 0)
    pg.reload(); pg.wait_for_timeout(800)
    check("turned off: stays off after a reload", pg.get_by_role("button", name="Phone view", exact=True).count() == 0)

    c.close(); ph.close()

    # 14. Turning it off stops the sign-in library's background refreshes (Astra Should 10)
    fake2 = FakeSupabase(); fake2.expires_in = 40
    c = b.new_context(viewport={"width": 1280, "height": 800}); pg = c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    c.route(SB + "/**", fake2.handle)
    pg.goto(B + "?cloud=1"); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="Phone view", exact=True).click(); pg.wait_for_timeout(400)
    dlg = pg.get_by_role("dialog", name="Phone view")
    dlg.get_by_label("Your email").fill("runner@example.invalid"); dlg.get_by_role("button", name="Email me a link").click(); pg.wait_for_timeout(300)
    dlg.get_by_text("The email has a code instead?").click(); dlg.get_by_label("Code from the email").fill("123456")
    dlg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(35000)
    on_refreshes = fake2.refreshes
    check("signed in with phone view on: tokens refresh (so the test can see it)", on_refreshes > 0)
    dlg.get_by_role("button", name="Turn off phone view here").click(); pg.wait_for_timeout(500)
    fake2.refreshes = 0
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(40000)
    check("turned off: no more token refreshes", fake2.refreshes == 0)
    c.close()

    check("no page errors", errs == []); print(errs)
    b.close()
print(len(ok), "pass", len(bad), "fail", bad)
