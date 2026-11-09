"""Computed contrast, browser-zoom reflow and simulated-touch acceptance.
Chromium emulation does not replace testing on real mobile devices or screen readers.
"""
import argparse, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--output", default="browser-report")
args = parser.parse_args()
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
fixture = output / "two-tracks.mid"
assert fixture.is_file(), "Run browser_smoke.py first"
report = {"contrast": [], "nontext": [], "targets": [], "checks": []}

def record(label):
    report["checks"].append(label)
    print("PASS", label, flush=True)

# For representative solid-background surfaces, composite computed ancestor
# backgrounds rather than guessing one contrast background for all labels.
COLOR_JS = r"""(rules) => {
  const parse = value => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) throw new Error('Unsupported color: ' + value);
    const n = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [n[0], n[1], n[2], n[3] ?? 1];
  };
  const mix = (a,b) => [a[0]*a[3]+b[0]*(1-a[3]),
                         a[1]*a[3]+b[1]*(1-a[3]),
                         a[2]*a[3]+b[2]*(1-a[3]),1];
  // Approximate the visually opaque first color stop for CSS gradients.
  // Without this, the charcoal inspector looks "transparent" in the DOM
  // and is incorrectly assessed against the light-gray workbench below.
  const bg = el => {
    const layers=[];
    for(let n=el;n instanceof HTMLElement;n=n.parentElement){
      const cs=getComputedStyle(n);
      const solid=parse(cs.backgroundColor);
      const stop=cs.backgroundImage.match(/rgba?\(([^)]+)\)/);
      layers.push({solid,gradient:stop?parse(stop[0]):null});
    }
    return layers.reverse().reduce((behind,layer)=>{
      const base=mix(layer.solid,behind);
      return layer.gradient ? mix(layer.gradient,base) : base;
    },[20,22,24,1]);
  };
  const linear = n => {n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4};
  const lum = c => .2126*linear(c[0])+.7152*linear(c[1])+.0722*linear(c[2]);
  return rules.map(rule => {
    const el=document.querySelector(rule.selector);
    if(!el) return {...rule,missing:true};
    const cs=getComputedStyle(el), background=bg(el);
    const foreground=mix(parse(cs.color),background);
    const a=lum(background), b=lum(foreground);
    return {...rule,size:parseFloat(cs.fontSize),
      ratio:Math.round(100*(Math.max(a,b)+.05)/(Math.min(a,b)+.05))/100,
      foreground:cs.color,background:background.slice(0,3).map(Math.round)};
  });
}"""

def contrast(page, scene, rules):
    rows = page.evaluate(COLOR_JS, rules)
    for item in rows:
        item["scene"] = scene
        assert not item.get("missing"), item
        assert item["size"] >= item["minimum"], item
        assert item["ratio"] >= 4.5, item
    report["contrast"].extend(rows)
    record(scene + ": computed text sizes and sample contrast >=4.5:1")

# Critical UI boundaries must remain distinguishable from their surroundings.
# This is sampled non-text contrast, not a universal WCAG conformance claim.
BORDER_JS = r"""(rules) => {
  const color = value => value.match(/[0-9.]+/g).slice(0,3).map(Number);
  const lin = n => {n/=255; return n<=.04045?n/12.92:((n+.055)/1.055)**2.4};
  const lum = c => .2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
  return rules.map(rule => {
    const el = document.querySelector(rule.selector);
    const backdrop = document.querySelector(rule.backdrop);
    if (!el || !backdrop) return {...rule,missing:true};
    const edge = color(getComputedStyle(el).borderTopColor);
    const backdropCss=getComputedStyle(backdrop);
    const stop=backdropCss.backgroundImage.match(/rgba?\(([^)]+)\)/);
    const surface = color(stop ? stop[0] : backdropCss.backgroundColor);
    const a = lum(edge), b = lum(surface);
    return {...rule,ratio:Math.round(100*(Math.max(a,b)+.05)/(Math.min(a,b)+.05))/100,
            edge, surface};
  });
}"""

def nontext(page, scene, rules):
    rows = page.evaluate(BORDER_JS, rules)
    for item in rows:
        item["scene"] = scene
        assert not item.get("missing") and item["ratio"] >= 3.0, item
    report["nontext"].extend(rows)
    record(scene + ": sampled control borders >=3:1 non-text contrast")

def dimensions(page, locator, name, minimum):
    box = locator.bounding_box()
    assert box and box["width"]>=minimum and box["height"]>=minimum,(name,box)
    report["targets"].append({"name":name,"viewport":page.viewport_size["width"],
                              "width":round(box["width"],1),"height":round(box["height"],1)})
    return box

def tap(page, locator, cdp):
    box=locator.bounding_box()
    assert box, "Missing touch target"
    x=box["x"]+box["width"]/2
    y=box["y"]+box["height"]/2
    cdp.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x,"y":y}]})
    page.wait_for_timeout(45)
    cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
    page.wait_for_timeout(80)

with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,**(
        {"executable_path":os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}))
    errors=[]
    desktop=browser.new_page(viewport={"width":1440,"height":900},has_touch=True)
    desktop.on("pageerror",lambda e:errors.append(str(e)))
    desktop.goto(args.url)
    desktop.evaluate("document.fonts.ready")
    contrast(desktop,"Desktop composer",[
        {"selector":".compose-panel .panel-version","minimum":11},
        {"selector":".compose-panel .eyebrow","minimum":11},
        {"selector":".compose-panel .section-heading h3","minimum":13},
        {"selector":".compose-panel .field-control > span","minimum":12},
        {"selector":".compose-compact-intro p","minimum":12},
        {"selector":".compose-disclosure > summary > span","minimum":12},
        {"selector":".precision-controls label > span","minimum":12},
        {"selector":".editor-context-right .time-signature","minimum":12},
        {"selector":".app-status","minimum":11},
    ])
    nontext(desktop,"Desktop form boundaries",[
        {"selector":".tool-segment","backdrop":".editor-toolbar"},
        {"selector":".precision-controls .select-field select","backdrop":".editor-toolbar"},
        {"selector":".sound-picker-trigger","backdrop":".inspector"},
    ])
    # Native progressive disclosure is both keyboard-operable and truly
    # hidden from the accessible interaction tree until explicitly expanded.
    optional=desktop.locator(".expression-disclosure")
    assert optional.get_attribute("open") is None
    expect(desktop.get_by_role("slider",name="Chord tension")).not_to_be_visible()
    summary=optional.locator("summary")
    summary.focus()
    summary.press("Enter")
    expect(optional).to_have_attribute("open","")
    expect(desktop.get_by_role("slider",name="Chord tension")).to_be_visible()
    summary.press("Enter")
    assert optional.get_attribute("open") is None
    record("Keyboard disclosure exposes and hides precise music controls on demand")
    desktop.get_by_role("button",name="Preview sound: Classic Analog. Open sound library").click()
    expect(desktop.get_by_role("dialog",name="Sound library")).to_be_visible()
    contrast(desktop,"Sound library",[
        {"selector":".sound-library-eyebrow","minimum":11},
        {"selector":".sound-library-row-character","minimum":11},
        {"selector":".sound-library-row-copy small","minimum":12},
        {"selector":".sound-library-footer","minimum":12},
    ])
    nontext(desktop,"Sound library search boundary",[
        {"selector":".sound-library-search","backdrop":".sound-library"},
    ])
    desktop.keyboard.press("Escape")
    desktop.close()

    # 200% browser zoom on a 1440x900 display behaves like ~720x450 CSS px
    # with a 2x device scale. body.style.zoom='2' does NOT test reflow.
    zoom=browser.new_page(viewport={"width":720,"height":450},device_scale_factor=2,has_touch=True)
    zoom.on("pageerror",lambda e:errors.append(str(e)))
    zoom.goto(args.url)
    zoom.evaluate("document.fonts.ready")
    assert zoom.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    for label in ("Project menu","Export MIDI","Fit pattern"):
        expect(zoom.get_by_role("button",name=label,exact=True)).to_be_visible()
    zoom.get_by_role("button",name="Project menu").click()
    expect(zoom.get_by_role("button",name="Import MIDI")).to_be_visible()
    zoom.get_by_role("button",name="Project menu").press("Escape")
    expect(zoom.get_by_role("button",name="Import MIDI")).not_to_be_visible()
    controls=zoom.locator(".app-header button:visible, .app-header summary:visible").evaluate_all("""xs=>xs.map(el=>{
      const b=el.getBoundingClientRect();
      return {name:el.getAttribute('aria-label')||el.textContent.trim(),
              x:b.left,y:b.top,w:b.width,h:b.height};
    })""")
    for i,a in enumerate(controls):
        assert a["x"]>=0 and a["x"]+a["w"]<=721,("header offscreen",a)
        for b in controls[i+1:]:
            w=max(0,min(a["x"]+a["w"],b["x"]+b["w"])-max(a["x"],b["x"]))
            h=max(0,min(a["y"]+a["h"],b["y"]+b["h"])-max(a["y"],b["y"]))
            assert w*h<=1,("header overlap",a,b)
    zoom.get_by_role("button",name="Toggle inspector",exact=True).click()
    zoom.wait_for_timeout(400)  # Let the slide-in sheet finish before geometry checks.
    expect(zoom.get_by_role("button",name="Generate pattern",exact=False).first).to_be_visible()
    panel=zoom.locator("#studio-inspector").bounding_box()
    button=zoom.get_by_role("button",name="Generate pattern",exact=False).first.bounding_box()
    assert panel and panel["x"]>=-1 and panel["x"]+panel["width"]<=721,("inspector offscreen",panel)
    assert button and button["x"]>=0 and button["x"]+button["width"]<=721,("Generate offscreen",button)
    zoom.screenshot(path=str(output/"typography-200-percent-reflow.png"))
    record("200% equivalent viewport: no header overlap; primary controls reachable")
    zoom.close()

    for width in (320,390):
        phone=browser.new_page(viewport={"width":width,"height":844},has_touch=True)
        phone.on("pageerror",lambda e:errors.append(str(e)))
        phone.goto(args.url)
        phone.evaluate("document.fonts.ready")
        cdp=phone.context.new_cdp_session(phone)
        for label in ("Draw","Select","Slice","Hand","Stamp"):
            btn=phone.get_by_role("button",name=label+" tool",exact=True)
            dimensions(phone,btn,label+" tool",40)
            tap(phone,btn,cdp)
            expect(btn).to_have_attribute("aria-pressed","true")
            expect(phone.locator(".active-tool-readout")).to_contain_text(label+" tool")
        assert phone.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
        nontext(phone,str(width)+"px active tool readout",[
            {"selector":".active-tool-readout","backdrop":".editor-toolbar"},
        ])
        record(str(width)+"px: CDP touch sweep through all 5 tools with 40px targets")
        phone.locator("input[type=file]").first.set_input_files(str(fixture))
        phone.wait_for_timeout(450)
        summary=phone.locator(".note-precision-summary")
        dimensions(phone,summary,"Precision edit disclosure",40)
        tap(phone,summary,cdp)
        expect(phone.locator(".note-precision-editor")).to_have_attribute("open","")
        before=phone.evaluate("JSON.parse(localStorage.getItem('midi-spark:session:v1')).progression.notes")
        phone.get_by_test_id("precision-note-select").select_option("0")
        duration=phone.get_by_test_id("precision-note-duration")
        duration.fill("2.5")
        duration.press("Tab")
        phone.wait_for_timeout(550)
        notes=phone.evaluate("JSON.parse(localStorage.getItem('midi-spark:session:v1')).progression.notes")
        assert notes[0]["duration"]==2.5 and notes[0]!=before[0] and notes[1:]==before[1:],notes[:2]
        record(str(width)+"px: exact note resize without dragging a narrow grid handle")
        phone.get_by_role("button",name="Toggle inspector",exact=True).click()
        phone.get_by_role("tab",name="Tracks",exact=True).click()
        mute=phone.get_by_role("button",name="Mute Keys",exact=True)
        solo=phone.get_by_role("button",name="Solo Keys",exact=True)
        dimensions(phone,mute,"Mute Keys",44)
        dimensions(phone,solo,"Solo Keys",44)
        phone.screenshot(path=str(output/("touch-accessibility-"+str(width)+".png")))
        record(str(width)+"px: track M/S controls >=44px")
        phone.close()
    assert not errors, errors
    browser.close()
(output/"accessibility-matrix.json").write_text(json.dumps(report,indent=2))
print("Completed",len(report["checks"]),"accessibility acceptance checks",flush=True)
