"""Production Chromium acceptance for note placement, selection and precision editing."""
import argparse
import json
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


SESSION_KEY = "midi-spark:session:v1"


def geometry(page):
    # The ruler and all 128 pitch rows share the canvas's actual zoom/scroll.
    grid = page.get_by_test_id("piano-grid").bounding_box()
    bars = page.locator(".measure-number")
    beat_width = (bars.nth(1).bounding_box()["x"] - bars.first.bounding_box()["x"]) / 4
    return grid["x"], grid["y"], beat_width, grid["height"] / 128


def point(page, beat, pitch):
    left, top, beat_width, row_height = geometry(page)
    return left + beat * beat_width, top + (127 - pitch + .5) * row_height


def center(locator):
    box = locator.bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def drag(page, start, end, cancel=False):
    page.mouse.move(*start)
    page.mouse.down()
    page.mouse.move(*end, steps=5)
    if cancel:
        page.keyboard.press("Escape")
    page.mouse.up()


def score(page):
    return page.get_by_test_id("piano-note").evaluate_all("""els => els.map(el =>
      [Number(el.dataset.midi), Number(el.dataset.start), Number(el.dataset.duration)])""")


def check_score(page, expected):
    expect(page.get_by_test_id("piano-note")).to_have_count(len(expected))
    assert score(page) == expected, (score(page), expected)


def selected(page):
    return page.locator('[data-testid="piano-note"][aria-pressed="true"]')


def blank(page, url):
    page.goto(url)
    page.get_by_role("button", name="Start blank", exact=True).click()
    page.get_by_role("combobox", name="Grid snap", exact=True).select_option("0.5")
    page.get_by_role("combobox", name="Draw length", exact=True).select_option("1")
    expect(page.get_by_test_id("piano-grid")).to_be_visible()


def check_desktop(page, url, output, record):
    blank(page, url)
    first = [60, .5, 1]
    second = [64, 1.5, 2]
    start = point(page, .88, 60)
    page.mouse.move(*start)
    ghost = page.get_by_test_id("placement-ghost")
    expect(ghost).to_be_visible()
    preview = ghost.bounding_box()
    page.mouse.click(*start)
    check_score(page, [first])
    expect(selected(page)).to_have_count(1)
    actual = page.get_by_test_id("piano-note").bounding_box()
    assert all(abs(preview[k] - actual[k]) <= 1 for k in ("x", "width")), (preview, actual)
    record("The hover preview and click land in the same subdivision at the chosen length")

    drag(page, point(page, 3.56, 64), point(page, 1.52, 64))
    check_score(page, [first, second])
    expect(selected(page)).to_have_attribute("data-midi", "64")
    drag(page, point(page, 2.07, 62), point(page, 3.5, 62), cancel=True)
    check_score(page, [first, second])
    page.get_by_role("button", name="Undo", exact=True).click()
    check_score(page, [first])
    page.get_by_role("button", name="Redo", exact=True).click()
    check_score(page, [first, second])
    record("Reverse drawing uses the release beat and Escape leaves no note or undo step")

    page.get_by_role("button", name="Select tool", exact=True).click()
    moves = page.get_by_test_id("note-move")
    drag(page, point(page, .1, 65), point(page, 3.65, 59))
    expect(selected(page)).to_have_count(2)
    drag(page, point(page, .12, 65), point(page, .2, 63), cancel=True)
    expect(selected(page)).to_have_count(2)
    page.mouse.click(*point(page, .1, 65))
    expect(selected(page)).to_have_count(0)
    record("Lasso selects overlapping notes and cancelling a replacement lasso retains the selection")
    moves.first.click()
    moves.nth(1).click(modifiers=["Shift"])
    expect(selected(page)).to_have_count(2)
    moves.first.click(modifiers=["Shift"])
    expect(selected(page)).to_have_count(1)
    expect(selected(page)).to_have_attribute("data-midi", "64")
    moves.first.click(modifiers=["Shift"])
    expect(selected(page)).to_have_count(2)
    record("Shift-click adds and removes individual notes without changing the score")

    page.keyboard.press("Alt+ArrowUp")
    check_score(page, [[61, .5, 1], [65, 1.5, 2]])
    page.keyboard.press("[")
    check_score(page, [[61, .5, .5], [65, 1.5, 1.5]])
    page.keyboard.press("ControlOrMeta+z")
    check_score(page, [[61, .5, 1], [65, 1.5, 2]])
    page.keyboard.press("ControlOrMeta+z")
    check_score(page, [first, second])
    record("A pointer selection can be transposed and shortened with the keyboard, one undo per edit")
    moves.first.click()
    moves.nth(1).click(modifiers=["Shift"])

    _, _, beat, row = geometry(page)
    x, y = center(moves.nth(1))
    drag(page, (x, y), (x - 2 * beat, y - row))
    check_score(page, [[61, 0, 1], [65, 1, 2]])
    page.get_by_role("button", name="Undo", exact=True).click()
    check_score(page, [first, second])
    # Undo clears selection. Select just the second note to isolate its resize.
    moves.nth(1).click()
    x, y = center(page.get_by_test_id("note-resize").nth(1))
    drag(page, (x, y), (x + beat, y), cancel=True)
    check_score(page, [first, second])
    drag(page, (x, y), (x + beat, y))
    check_score(page, [first, [64, 1.5, 3]])
    page.get_by_role("button", name="Undo", exact=True).click()
    check_score(page, [first, second])
    record("Bounded group moves preserve intervals and a resize stays one reversible edit")

    page.get_by_role("button", name="Slice tool", exact=True).click()
    page.mouse.click(*point(page, 2.55, 64))
    check_score(page, [first, [64, 1.5, 1], [64, 2.5, 1]])
    page.get_by_role("button", name="Undo", exact=True).click()
    check_score(page, [first, second])
    record("A slice at a beat creates two contiguous notes and one undo restores the original")

    # Set two different velocities using the real editor, then exercise a mixed selection.
    page.get_by_role("button", name="Select tool", exact=True).click()
    moves.first.click()
    page.locator(".note-precision-summary").click()
    velocity = page.get_by_test_id("precision-note-velocity")
    pitch = page.get_by_test_id("precision-note-pitch")
    pitch.fill("")
    pitch.press("Tab")
    expect(pitch).to_have_value("60")
    check_score(page, [first, second])
    velocity.fill("61")
    velocity.press("Enter")
    moves.nth(1).click(modifiers=["Shift"])
    expect(selected(page)).to_have_count(2)
    velocity.focus()
    velocity.press("Tab")
    velocity.fill("43")
    velocity.press("Escape")
    notes = page.get_by_test_id("piano-note")
    expect(notes.first).to_have_accessible_name(re.compile(r"velocity 61 percent"))
    expect(notes.nth(1)).to_have_accessible_name(re.compile(r"velocity 80 percent"))
    page.get_by_role("button", name="Undo", exact=True).click()
    expect(notes.first).to_have_accessible_name(re.compile(r"velocity 80 percent"))
    record("Tabbing through mixed velocities and cancelling a draft preserve both dynamics and history")
    page.locator(".note-precision-summary").click()
    page.screenshot(path=output / "timeline-desktop.png")


def check_scrolled_grid(page, url, output, record):
    blank(page, url)
    view = page.get_by_role("button", name="Canvas view options", exact=True)
    view.click()
    for _ in range(3):
        page.get_by_role("button", name="Zoom in", exact=True).click()
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Hand tool", exact=True).click()
    drag(page, point(page, 4.5, 63), point(page, 2.5, 63))
    canvas = page.get_by_role("region", name="Piano roll canvas")
    assert canvas.evaluate("el => el.scrollLeft") > 0
    page.get_by_role("button", name="Draw tool", exact=True).click()
    page.get_by_role("combobox", name="Grid snap", exact=True).select_option("0")
    _, _, beat, _ = geometry(page)
    # Recompute the point after both zoom and pan. The chosen time is off-grid.
    intended = 4.37
    page.mouse.click(*point(page, intended, 63))
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    pitch, actual, duration = score(page)[0]
    assert pitch == 63 and duration == 1 and abs(actual - intended) <= 1 / beat, (actual, intended)
    record("Snap Off places under the pointer in a horizontally scrolled, zoomed timeline")

    initial_scroll = canvas.evaluate("el => el.scrollLeft")
    edge = canvas.evaluate("el => el.getBoundingClientRect().left + el.clientWidth - 4")
    start = point(page, 4.5, 64)
    page.mouse.move(*start)
    page.mouse.down()
    try:
        page.mouse.move(edge, start[1], steps=4)
        page.wait_for_function("initial => document.querySelector('.piano-viewport').scrollLeft > initial + 12",
                               arg=initial_scroll)
        page.keyboard.press("Escape")
    finally:
        page.mouse.up()
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    record("Dragging near the inside edge scrolls to later beats without leaving the window")
    page.wait_for_function("""({key, beat}) => {
      const session = JSON.parse(localStorage.getItem(key));
      return session?.progression?.notes?.length === 1 && Math.abs(session.zoomX - beat) < .05;
    }""", arg={"key": SESSION_KEY, "beat": beat})
    page.reload()
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    assert abs(geometry(page)[2] - beat) < .05
    assert abs(score(page)[0][1] - actual) < 1e-8
    record("Reload preserves the chosen horizontal zoom and free-timed MIDI onset")

    page.get_by_role("button", name="Project menu", exact=True).click()
    with page.expect_download() as download:
        page.get_by_role("button", name="Save MIDI Spark project", exact=True).click()
    archive = output / "timeline.midispark"
    download.value.save_as(archive)
    page.get_by_role("button", name="Fit pattern", exact=True).click()
    assert abs(geometry(page)[2] - beat) > 1
    page.locator('input[aria-label="Open MIDI Spark project file"]').set_input_files(archive)
    page.locator("dialog.replace-project-dialog .danger-action").click()
    expect(page.locator("dialog.replace-project-dialog")).not_to_be_visible()
    assert abs(geometry(page)[2] - beat) < .05
    assert abs(score(page)[0][1] - actual) < 1e-8
    record("Opening a native project restores its saved zoom and precise note timing after Fit")

    page.get_by_role("combobox", name="Grid snap", exact=True).select_option("0.5")
    page.get_by_role("button", name="Stamp tool", exact=True).click()
    start = point(page, 1.1, 60)
    page.mouse.move(*start)
    ghosts = page.get_by_test_id("placement-ghost")
    expect(ghosts).to_have_count(3)
    page.mouse.down()
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    page.keyboard.press("Escape")
    page.mouse.up()
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    page.mouse.click(*start)
    expect(page.get_by_test_id("piano-note")).to_have_count(4)
    assert score(page)[1:] == [[60, 1, 1], [64, 1, 1], [67, 1, 1]]
    page.get_by_role("button", name="Undo", exact=True).click()
    expect(page.get_by_test_id("piano-note")).to_have_count(1)
    record("The stamp previews its full triad, cancels on Escape, and commits in one undo step")


def check_touch(page, url, width, output, record):
    blank(page, url)
    # The initial mobile editing scale leaves room for a sixteenth-note body and handle.
    assert geometry(page)[2] * .25 >= 12
    summary = page.locator(".note-precision-summary")
    summary.press("Enter")
    page.get_by_role("button", name="Add note at playhead", exact=True).press("Enter")
    notes = page.get_by_test_id("piano-note")
    expect(notes).to_have_count(1)
    expect(selected(page)).to_have_count(1)
    assert score(page)[0][1:] == [0, 1], score(page)
    summary.press("Enter")
    undo = page.get_by_role("button", name="Undo", exact=True)
    redo = page.get_by_role("button", name="Redo", exact=True)
    undo.tap()
    check_score(page, [])
    redo.tap()
    expect(notes).to_have_count(1)
    undo.tap()
    check_score(page, [])
    record(f"{width}px: keyboard insertion works from blank and touch Undo and Redo restore it")

    # Use Chromium's touch pipeline for cancellation and tap slop, without synthesized mouse events.
    cdp = page.context.new_cdp_session(page)
    def touch(event, position=None):
        contacts = [{"x": position[0], "y": position[1]}] if position else []
        cdp.send("Input.dispatchTouchEvent", {"type": event, "touchPoints": contacts})
    x, y = point(page, .82, 60)
    assert page.get_by_test_id("piano-grid").evaluate(
        "(grid, point) => grid.contains(document.elementFromPoint(...point))", [x, y]
    ), f"{width}px: middle C is obscured by the ruler or velocity lane"
    touch("touchStart", (x, y))
    touch("touchMove", (x + 2, y + 1))
    touch("touchEnd")
    check_score(page, [[60, .5, 1]])
    x, y = point(page, 1.6, 62)
    touch("touchStart", (x, y))
    touch("touchMove", point(page, 3.02, 62))
    touch("touchCancel")
    check_score(page, [[60, .5, 1]])
    touch("touchStart", (x, y))
    touch("touchMove", point(page, 3.02, 62))
    touch("touchEnd")
    check_score(page, [[60, .5, 1], [62, 1.5, 1.5]])
    expect(selected(page)).to_have_attribute("data-midi", "62")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.wait_for_function("""key => JSON.parse(localStorage.getItem(key))?.progression?.notes?.length === 2""", arg=SESSION_KEY)
    page.screenshot(path=output / f"timeline-touch-{width}.png")
    page.reload()
    check_score(page, [[60, .5, 1], [62, 1.5, 1.5]])
    record(f"{width}px: finger jitter keeps the chosen length, touch cancellation rolls back, and the next drag survives reload")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:4173")
    parser.add_argument("--output", default="browser-report")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    passed, errors = [], []
    def record(label):
        passed.append(label)
        print("PASS", label, flush=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH"))
        scenarios = [
            ("desktop", 1440, 900, lambda page: check_desktop(page, args.url, output, record)),
            ("zoom", 1440, 900, lambda page: check_scrolled_grid(page, args.url, output, record)),
            ("phone", 390, 844, lambda page: check_touch(page, args.url, 390, output, record)),
            ("compact", 320, 740, lambda page: check_touch(page, args.url, 320, output, record)),
        ]
        for name, width, height, check in scenarios:
            page = browser.new_page(viewport={"width": width, "height": height}, has_touch=width < 500)
            page.on("pageerror", lambda error: errors.append(str(error)))
            try:
                check(page)
            except Exception:
                page.screenshot(path=output / f"timeline-failure-{name}.png")
                raise
            finally:
                page.close()
        browser.close()
    assert not errors, errors
    (output / "timeline-results.json").write_text(json.dumps({"checks": passed, "errors": errors}, indent=2))


if __name__ == "__main__":
    main()
