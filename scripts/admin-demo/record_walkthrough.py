"""Record a narrated walkthrough of the admin and superadmin panels.

Usage (with demo_server.py on :5050 and the frontend on :3100, see README.md):
    python scripts/admin-demo/record_walkthrough.py <output-dir>
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100"
OUT = Path(sys.argv[1])
SHOTS = OUT / "frames"
SHOTS.mkdir(parents=True, exist_ok=True)
PASSWORD = "demo-pass-123"

OVERLAY_SCRIPT = """
(() => {
  const ensure = () => {
    if (!window.__demoReady) return;
    const root = document.documentElement;
    if (!document.getElementById('demo-hide-dev')) {
      const style = document.createElement('style');
      style.id = 'demo-hide-dev';
      style.textContent = 'nextjs-portal { display: none !important; }';
      root.appendChild(style);
    }
    if (!document.getElementById('demo-cursor')) {
      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      Object.assign(cursor.style, {
        position: 'fixed', width: '18px', height: '18px', borderRadius: '50%',
        background: 'rgba(250, 204, 21, 0.85)', border: '2px solid #111',
        zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-50%, -50%)',
        left: '-40px', top: '-40px', transition: 'width .1s, height .1s',
      });
      root.appendChild(cursor);
      window.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      }, true);
      window.addEventListener('mousedown', () => {
        cursor.style.width = '28px'; cursor.style.height = '28px';
      }, true);
      window.addEventListener('mouseup', () => {
        cursor.style.width = '18px'; cursor.style.height = '18px';
      }, true);
    }
    if (!document.getElementById('demo-caption')) {
      const caption = document.createElement('div');
      caption.id = 'demo-caption';
      Object.assign(caption.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
        maxWidth: '900px', padding: '12px 20px', borderRadius: '14px',
        background: 'rgba(17, 17, 17, 0.88)', color: '#fff', zIndex: 2147483646,
        font: '500 17px/1.4 Inter, system-ui, sans-serif', textAlign: 'center',
        pointerEvents: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.25)',
      });
      caption.textContent = window.__demoCaption || '';
      caption.style.display = caption.textContent ? 'block' : 'none';
      root.appendChild(caption);
    }
  };
  window.__setDemoCaption = (text) => {
    window.__demoReady = true;
    window.__demoCaption = text;
    sessionStorage.setItem('demoCaption', text);
    ensure();
    const caption = document.getElementById('demo-caption');
    caption.textContent = text;
    caption.style.display = text ? 'block' : 'none';
  };
  window.__demoCaption = sessionStorage.getItem('demoCaption') || '';
  window.addEventListener('load', () => {
    setTimeout(() => { window.__demoReady = true; ensure(); }, 300);
  });
})();
"""


class Walkthrough:
    def __init__(self, page):
        self.page = page
        self.shot_index = 0

    def caption(self, text, hold=2.2):
        self.page.evaluate("(text) => window.__setDemoCaption(text)", text)
        self.page.wait_for_timeout(int(hold * 1000))

    def shot(self, name):
        self.shot_index += 1
        self.page.screenshot(path=str(SHOTS / f"{self.shot_index:02d}-{name}.png"))

    def move_to(self, locator):
        locator.scroll_into_view_if_needed()
        box = locator.bounding_box()
        if box:
            self.page.mouse.move(
                box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=18
            )
        self.page.wait_for_timeout(250)

    def click(self, locator, pause=0.9):
        locator = locator.first
        self.move_to(locator)
        locator.click()
        self.page.wait_for_timeout(int(pause * 1000))

    def type(self, locator, text):
        self.click(locator, pause=0.2)
        locator.first.fill("")
        locator.first.type(text, delay=35)
        self.page.wait_for_timeout(300)

    def select(self, trigger, option_name):
        self.click(trigger, pause=0.5)
        self.click(self.page.get_by_role("option", name=option_name, exact=True), 0.8)

    def tab(self, name):
        self.click(self.page.get_by_role("tab", name=name, exact=True), pause=1.4)

    def login(self, email):
        self.page.evaluate("localStorage.clear()")
        self.page.goto(BASE + "/login")
        self.page.wait_for_load_state("networkidle")
        self.type(self.page.get_by_placeholder("Enter your email"), email)
        self.type(self.page.get_by_placeholder("Enter your password"), PASSWORD)
        self.click(self.page.locator("button[type=submit]"), pause=2.5)

    def go(self, path, wait=2.0):
        self.page.goto(BASE + path)
        self.page.wait_for_load_state("networkidle")
        self.page.wait_for_timeout(int(wait * 1000))


def client_admin_tour(demo, page):
    demo.caption("Part 1 — The client admin panel, as Maya, owner of Acme Legal", 0.5)
    demo.login("maya@acmelegal.com")
    demo.caption(
        "Usage is now billed per team. Members pick a workspace under "
        "“Usage billed to”.",
        1.5,
    )
    demo.select(page.get_by_role("combobox").filter(has_text="Personal"), "Acme Legal")
    demo.caption("Owners and admins get an Admin entry in the sidebar.", 1.2)
    demo.click(page.get_by_role("link", name="Admin"), pause=2.5)
    demo.caption(
        "Overview: team spend, this month vs. the $60 budget, seats used "
        "and active members.",
        3.0,
    )
    demo.shot("admin-overview")
    demo.click(page.get_by_role("button", name="Tokens", exact=True))
    demo.click(page.get_by_role("button", name="90d", exact=True), pause=1.8)
    demo.caption(
        "Usage only counts chats billed to this team — personal chats are excluded.",
        2.5,
    )
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(1200)
    page.mouse.wheel(0, -500)
    demo.click(page.get_by_role("button", name="30d", exact=True))

    demo.tab("Members")
    demo.caption(
        "Members: last login and per-person spend. Only the owner can change roles.",
        2.5,
    )
    demo.shot("admin-members")
    role_trigger = page.locator("table button[role=combobox]").nth(2)
    demo.select(role_trigger, "Admin")
    demo.caption("Bulk invite: paste a list or upload a CSV.", 1.2)
    demo.click(page.get_by_role("button", name="Bulk invite"))
    demo.type(
        page.get_by_placeholder("ana@company.com"),
        "lena@acmelegal.com, omar@acmelegal.com\njames@northwind.com",
    )
    demo.caption(
        "Existing users are added instantly; others get an email invite. "
        "Seat limits apply.",
        1.8,
    )
    demo.click(page.get_by_role("button", name="Invite 3"), pause=2.0)
    demo.shot("admin-bulk-invite")
    demo.click(page.get_by_role("button", name="Done"))

    demo.tab("Invites")
    demo.caption("Pending and expired invites can be revoked.", 1.8)
    demo.click(
        page.get_by_role("row", name="old.invite@acmelegal.com").get_by_role(
            "button", name="Revoke"
        ),
        1.5,
    )

    demo.tab("Settings")
    demo.caption(
        "Settings: monthly budget with warn or hard-block when it is reached.", 1.5
    )
    demo.select(
        page.get_by_role("combobox").filter(has_text="Warn members"),
        "Block new messages until next month",
    )
    demo.click(page.get_by_role("button", name="Save budget"), pause=1.5)
    demo.caption("Model access: restrict which models the team can use.", 1.2)
    demo.select(
        page.get_by_role("combobox").filter(has_text="All models"),
        "Only selected models",
    )
    demo.click(page.get_by_role("checkbox").nth(0), 0.4)
    demo.click(page.get_by_role("checkbox").nth(1), 0.4)
    demo.click(page.get_by_role("button", name="Save model access"), pause=1.5)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(800)
    demo.caption(
        "Verified company domain: colleagues auto-join, and SSO can be required. "
        "Plus a data-retention policy.",
        3.0,
    )
    demo.shot("admin-settings")

    demo.tab("Activity")
    demo.caption("Every admin action lands in the team’s audit log.", 2.5)
    demo.shot("admin-activity")
    demo.caption("Usage can be exported to CSV for finance.", 0.8)
    with page.expect_download() as download_info:
        demo.click(page.get_by_role("button", name="Export CSV"), pause=1.0)
    download_info.value.save_as(OUT / "acme-usage.csv")


def superadmin_tour(demo, page):
    demo.caption("Part 2 — The superadmin console, as the platform operator", 0.5)
    demo.login("root@vivexy.com")
    demo.click(page.get_by_role("link", name="Superadmin"), pause=2.5)
    demo.caption(
        "Live alerts: platform and per-client spend spikes, failing scheduled tasks, "
        "over-budget clients.",
        3.2,
    )
    demo.shot("superadmin-overview")
    demo.caption(
        "Revenue (MRR/ARR) next to AI cost, trials, churn, users and activity.", 2.8
    )
    page.mouse.wheel(0, 650)
    demo.caption("Platform usage over time and where the spend goes by model.", 2.5)
    page.mouse.wheel(0, -650)

    demo.tab("Clients")
    demo.caption("Every client with owner, plan, seats, 30-day spend and status.", 2.2)
    demo.shot("superadmin-clients")
    demo.type(
        page.get_by_placeholder("Search by client name or owner email"), "initech"
    )
    page.wait_for_timeout(1200)
    demo.click(page.get_by_role("cell", name="Initech Advisory"), pause=2.0)
    demo.caption(
        "Client detail: spend, seats, suspension, seat limit and private notes.", 2.2
    )
    sheet = page.get_by_role("dialog")
    sheet.locator("text=Plan").first.scroll_into_view_if_needed()
    demo.caption("Convert the trial to a paid Pro plan (manual billing / comps).", 1.0)
    # The plan form defaults to Pro / "Paid / comp", so Apply converts the trial.
    demo.click(sheet.get_by_role("button", name="Apply"), pause=1.5)
    demo.caption("Per-client feature flags.", 0.8)
    demo.type(sheet.get_by_placeholder("new-flag-name"), "beta-agents")
    demo.click(sheet.get_by_role("button", name="Add"), pause=1.4)
    demo.shot("superadmin-client-sheet")
    page.keyboard.press("Escape")
    page.wait_for_timeout(800)

    demo.tab("Users")
    demo.caption("All users with role, teams, spend and last login.", 2.0)
    demo.type(page.get_by_placeholder("Search by name or email"), "maya")
    page.wait_for_timeout(1200)
    demo.click(page.get_by_role("cell", name="Maya Chen"), pause=2.0)
    demo.caption(
        "Support tools: view the app as this user (read-only, 30 min, audited), "
        "GDPR export/erase.",
        2.8,
    )
    demo.shot("superadmin-user-sheet")
    demo.click(page.get_by_role("dialog").get_by_role("button", name="View as user"))
    demo.click(
        page.get_by_role("alertdialog").get_by_role("button", name="Start session"),
        pause=3.0,
    )
    demo.caption("Now seeing exactly what Maya sees — note the banner.", 1.5)
    demo.go("/admin", wait=2.5)
    demo.tab("Settings")
    demo.caption("Changes are blocked during impersonation.", 0.8)
    demo.click(page.get_by_role("button", name="Save budget"), pause=2.2)
    demo.shot("impersonation-read-only")
    demo.click(page.get_by_role("button", name="Exit"), pause=3.0)

    demo.tab("Models")
    demo.caption(
        "Models: enable/disable for everyone and edit pricing used for cost tracking.",
        1.5,
    )
    demo.click(page.get_by_role("switch", name="Enable Mistral Large"), pause=1.5)
    demo.shot("superadmin-models")

    demo.tab("Health")
    demo.caption(
        "Health: database and Redis latency, job broker, failing scheduled tasks.", 3.0
    )
    demo.shot("superadmin-health")

    demo.tab("Announcements")
    demo.caption("Announcements: banners for everyone or a single client.", 1.0)
    demo.type(
        page.get_by_placeholder("Scheduled maintenance"),
        "Scheduled maintenance Sunday 02:00 UTC",
    )
    demo.type(
        page.get_by_role("textbox", name="Details"),
        "Expect up to 10 minutes of downtime.",
    )
    demo.select(page.get_by_role("combobox").filter(has_text="Info"), "Warning")
    demo.click(page.get_by_role("button", name="Publish"), pause=1.5)
    demo.go("/superadmin", wait=2.0)
    demo.caption("The banner now shows across the app.", 2.2)
    demo.shot("announcement-banner")

    demo.tab("Audit log")
    demo.caption(
        "Everything — plan changes, flags, impersonation, model edits — is audited.",
        3.0,
    )
    demo.shot("superadmin-audit")


def support_tour(demo, page):
    demo.caption("Part 3 — Read-only support staff (platform ADMIN role)", 0.5)
    demo.login("support@vivexy.com")
    demo.click(page.get_by_role("link", name="Superadmin"), pause=2.5)
    demo.tab("Clients")
    demo.click(page.get_by_role("cell", name="Acme Legal"), pause=2.0)
    demo.caption("Support can see everything but can’t change it.", 3.0)
    demo.shot("support-read-only")
    page.keyboard.press("Escape")
    demo.caption("That’s the tour — admin panel for clients, console for you.", 2.5)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get("CHROMIUM_PATH") or None
    )
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        record_video_dir=str(OUT / "video"),
        record_video_size={"width": 1440, "height": 900},
        accept_downloads=True,
    )
    context.add_init_script(OVERLAY_SCRIPT)
    page = context.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/login")
    demo = Walkthrough(page)
    try:
        client_admin_tour(demo, page)
        superadmin_tour(demo, page)
        support_tour(demo, page)
    finally:
        demo.shot("final")
        video_path = page.video.path()
        context.close()
        browser.close()
        print("video:", video_path)
        print("page errors:", errors)
