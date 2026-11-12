"""Sound Library acceptance on the production build in real Chromium.

Covers browsing, staging, cancellation, focus, overflow, touch target geometry,
resize/zoom reflow, backdrop hit testing, favorites, and rapid audition.
Screenshots/report are CI evidence, not a replacement for human visual QA,
assistive-technology testing, or physical iOS/Android devices.
"""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--output", default="browser-report")
args = parser.parse_args()
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
checks = []
measurements = []
errors = []

def record(label):
    checks.append(label)
    print("PASS", label, flush=True)

def open_library(page):
    page.locator(".sound-picker-trigger").first.click()
    expect(page.get_by_role("dialog", name="Sound library")).to_be_visible()
    expect(page.get_by_role("searchbox", name="Search presets")).to_be_focused()

def assert_layout(page, width, height):
    info = page.evaluate("""() => {
      const box = selector => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,
          width:b.width,height:b.height,clientWidth:el.clientWidth,
          scrollWidth:el.scrollWidth,clientHeight:el.clientHeight,
          scrollHeight:el.scrollHeight};
      };
      const topmost = selector => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const b = el.getBoundingClientRect();
        const target = document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
        return !!target && el.contains(target);
      };
      const control = selector => ({
        ...box(selector), hit:topmost(selector)
      });
      return {
        modal:box(".sound-library"), header:box(".sound-library-header"),
        categories:box(".sound-library-categories"),tools:box(".sound-library-tools"),
        results:box(".sound-library-results"),footer:box(".sound-library-footer"),
        close:control(".sound-library-close"),cancel:control(".sound-library-cancel"),
        preview:control(".sound-library-preview-action"),
        apply:control(".sound-library-apply"),
        search:box(".sound-library-search"),
        bodyOverflow:document.body.style.overflow,
        rootInert:document.querySelector("#root").inert,
        screenW:window.innerWidth,screenH:window.innerHeight,
        visualHeight:window.visualViewport?.height ?? window.innerHeight,
        layerHeight:document.querySelector(".sound-library-layer").getBoundingClientRect().height,
        clippedRows:[...document.querySelectorAll(".sound-library-row")].flatMap((row,i) => {
          const outer=row.getBoundingClientRect();
          const actions=row.querySelector(".sound-library-row-actions")?.getBoundingClientRect();
          const copy=row.querySelector(".sound-library-row-copy")?.getBoundingClientRect();
          if(!actions || !copy) return [{index:i,reason:"missing elements"}];
          const clipped=actions.bottom>outer.bottom+0.5 || actions.left<outer.left-1 ||
            actions.right>outer.right+1 || copy.bottom>outer.bottom+0.5;
          return clipped ? [{index:i,rowBottom:outer.bottom,actionsBottom:actions.bottom,
            copyBottom:copy.bottom}] : [];
        })
      };
    }""")
    assert abs(info["screenW"]-width)<=1 and abs(info["screenH"]-height)<=1, info
    assert info["rootInert"] and info["bodyOverflow"]=="hidden", info
    assert abs(info["layerHeight"]-info["visualHeight"])<=2, info
    assert info["results"]["height"]>=35, info
    for name in ("modal","header","categories","tools","results","footer","search",
                 "close","cancel","preview","apply"):
        box = info[name]
        assert box is not None, (name,info)
        assert box["left"]>=-1 and box["top"]>=-1, (name,box)
        assert box["right"]<=width+1 and box["bottom"]<=height+1, (name,box)
        assert box["scrollWidth"] <= box["clientWidth"]+2 or name in ("categories","results"),(name,box)
    for name in ("close","cancel","preview","apply"):
        assert info[name]["height"]>=44 and info[name]["width"]>=44,(name,info)
        assert info[name]["hit"],(name,info)
    assert info["search"]["height"]>=44,info
    assert not info["clippedRows"], ("Card text/action controls overflow their surface",info["clippedRows"])
    # Verify actual hit-testing of card actions: a visible Play icon is not
    # enough if the button is clipped under the card/scroll container.
    for index in (0,24,48):
        button = page.locator(".sound-library-row-play").nth(index)
        button.scroll_into_view_if_needed()
        hit = button.evaluate("""(el) => {
          const b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
          const target=document.elementFromPoint(x,y);
          const results=document.querySelector(".sound-library-results").getBoundingClientRect();
          return {topmost:!!target && el.contains(target),inResults:x>=results.left&&
            x<=results.right&&y>=results.top&&y<=results.bottom,bottom:b.bottom};
        }""")
        assert hit["topmost"] and hit["inResults"], (index,hit,info)
    # Even when scrolling to the bottom, the footer must stay reachable.
    page.locator(".sound-library-results").evaluate("(el)=>{el.scrollTop=el.scrollHeight;}")
    assert page.locator(".sound-library-results").evaluate("(el)=>el.scrollTop")>0
    page.locator(".sound-library-results").evaluate("(el)=>{el.scrollTop=0;}")
    measurements.append({"viewport":[width,height],**info})

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, **(
        {"executable_path":os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}))
    page = browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1,
                            has_touch=True)
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.goto(args.url)
    page.evaluate("document.fonts.ready")
    open_library(page)
    expect(page.locator(".sound-library-row")).to_have_count(49)
    expect(page.get_by_role("status").filter(has_text="49 of 49 sounds")).to_be_visible()
    assert_layout(page,1440,900)
    page.screenshot(path=str(output/"library-premium-desktop.png"))
    record("Desktop collection shows 49 presets, stable layout and reachable modal actions")

    # Cards navigate in DOM row-major order on desktop; Enter stages rather
    # than committing, so a keyboard-only user can audition without data loss.
    cards = page.locator(".sound-library-select")
    cards.first.focus()
    page.keyboard.press("ArrowRight")
    expect(cards.nth(1)).to_be_focused()
    page.keyboard.press("ArrowDown")
    expect(cards.nth(3)).to_be_focused()
    page.keyboard.press("Home")
    expect(cards.first).to_be_focused()
    page.keyboard.press("End")
    expect(cards.last).to_be_focused()
    page.keyboard.press("Enter")
    expect(cards.last).to_have_attribute("aria-pressed","true")
    assert "Classic Analog" in page.locator(".sound-picker-title").first.inner_text()
    page.get_by_role("button", name="Cancel", exact=True).click()
    expect(page.get_by_role("dialog", name="Sound library")).not_to_be_visible()
    assert not page.locator("#root").evaluate("(el)=>el.inert")
    assert page.evaluate("document.body.style.overflow") != "hidden"
    expect(page.locator(".sound-picker-trigger").first).to_be_focused()
    record("Card keyboard navigation stages only; Cancel restores focus and document scroll")

    open_library(page)
    close_button=page.get_by_role("button",name="Close sound library")
    close_button.focus()
    page.keyboard.press("Shift+Tab")
    expect(page.get_by_role("button",name="Done",exact=True)).to_be_focused()
    page.keyboard.press("Tab")
    expect(close_button).to_be_focused()
    page.mouse.click(5,5)  # use a real outside pointer path; backdrop unmounts on pointerdown
    expect(page.get_by_role("dialog",name="Sound library")).not_to_be_visible()
    expect(page.locator(".sound-picker-trigger").first).to_be_focused()
    record("Modal focus trap wraps in both directions and backdrop dismisses safely")

    open_library(page)
    search = page.get_by_role("searchbox",name="Search presets")
    search.fill("unfindable-preset-987")
    expect(page.locator(".sound-library-row")).to_have_count(0)
    expect(page.get_by_text("No matching sounds")).to_be_visible()
    page.keyboard.press("Escape")
    expect(search).to_have_value("")
    expect(page.locator(".sound-library-row")).to_have_count(49)
    expect(page.get_by_role("dialog",name="Sound library")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog",name="Sound library")).not_to_be_visible()
    record("Search Escape clears before a second Escape dismisses; empty state is recoverable")

    open_library(page)
    page.get_by_role("button",name="Keys",exact=True).click()
    expect(page.locator(".sound-library-row")).to_have_count(8)
    search.fill("glass piano")
    expect(page.locator(".sound-library-row")).to_have_count(1)
    page.screenshot(path=str(output/"library-premium-filtered.png"))
    page.locator(".sound-library-select").first.click()
    expect(page.get_by_role("button",name="Use Glass Piano",exact=True)).to_be_visible()
    assert "Classic Analog" in page.locator(".sound-picker-title").first.inner_text()
    page.get_by_role("button",name="Add Glass Piano to favorites").click()
    page.get_by_role("button",name="Favorites",exact=True).click()
    expect(page.locator(".sound-library-row")).to_have_count(1)
    page.get_by_role("button",name="Remove Glass Piano from favorites").click()
    expect(page.get_by_role("searchbox",name="Search presets")).to_be_focused()
    expect(page.get_by_text("No matching sounds")).to_be_visible()
    page.get_by_role("button",name="Show Glass Piano in the sound collection").click()
    expect(search).to_have_value("")
    expect(page.locator(".sound-library-row")).to_have_count(49)
    active=page.locator('.sound-library-row[data-active="true"] .sound-library-select')
    expect(active).to_have_count(1)
    expect(active).to_be_focused()
    expect(active).to_be_in_viewport()
    record("Category+search, favorites, focus repair and reveal selected across filters")

    # Modal stays open while moving between layout breakpoints, including the
    # 720x450 CSS viewport / DPR=2 proxy for 200% zoom on a 1440x900 display.
    for width,height in ((1024,768),(800,600),(720,450),(390,844),
                         (375,667),(320,640),(320,360)):
        page.set_viewport_size({"width":width,"height":height})
        page.wait_for_timeout(90)
        expect(page.get_by_role("dialog",name="Sound library")).to_be_visible()
        assert_layout(page,width,height)
        if width in (720,390,320):
            page.screenshot(path=str(output/f"library-{width}x{height}.png"))
    record("Seven responsive/zoom-like viewports preserve controls, scrolling and topmost hit targets")

    # Mobile grid is one column. The preview is independent from staging, and
    # rapid previews followed by dismissal cannot leave a stale busy UI.
    page.set_viewport_size({"width":390,"height":844})
    cards = page.locator(".sound-library-select")
    cards.first.focus()
    page.keyboard.press("ArrowDown")
    expect(cards.nth(1)).to_be_focused()
    page.get_by_role("button",name="Preview Classic Analog").click()
    expect(page.locator(".sound-library-row-play[data-preview-state='playing']")).to_have_count(1)
    page.screenshot(path=str(output/"library-mobile-audition-playing.png"))
    page.get_by_role("button",name="Preview Glass Piano").click()
    expect(page.locator(".sound-library-row-play[data-preview-state='playing']")).to_have_count(1)
    page.get_by_role("button",name="Cancel",exact=True).click()
    expect(page.get_by_role("dialog",name="Sound library")).not_to_be_visible()
    page.set_viewport_size({"width":1440,"height":900})
    open_library(page)
    expect(page.locator(".sound-library-row")).to_have_count(49)
    assert page.locator(".sound-library [aria-busy='true']").count()==0
    assert not errors,errors
    record("Mobile card navigation, audible preview status, rapid audition and dismiss/reopen state")

    page.get_by_role("button",name="Keys",exact=True).click()
    page.get_by_role("searchbox",name="Search presets").fill("glass piano")
    page.locator(".sound-library-select").first.click()
    page.get_by_role("button",name="Use Glass Piano",exact=True).click()
    expect(page.get_by_role("dialog",name="Sound library")).not_to_be_visible()
    expect(page.locator(".sound-picker-title").first).to_contain_text("Glass Piano")
    record("Explicit Apply commits the chosen preset; browsing and cancellation do not")

    (output/"library-qa.json").write_text(json.dumps({
        "checks":checks,"viewport_measurements":measurements,"page_errors":errors
    },indent=2))
    browser.close()
    print("Library QA:",len(checks),"acceptance groups passed",flush=True)
