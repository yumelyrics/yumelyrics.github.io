#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fill_rirekisho.py
------------------
Fills the official 履歴書 (Rirekisho / Japanese CV) template
("Rirekisho__CV_.xlsx", sheet "履歴書_フォーマット") with real data
WITHOUT touching styles.xml, the merged-cell map, borders, fonts or the
drawing (the dashed photo-box shape) at all.

Why not openpyxl for writing?
  openpyxl silently drops xl/drawings/*.xml (the photo-box shape) whenever
  it re-saves a workbook that has any drawing/shape in it. That is how the
  "borders / layout mismatch" happens after a normal openpyxl edit-and-save.
  This script instead edits the worksheet XML for exactly the target cells
  and re-zips the ORIGINAL file's other parts unchanged, so the output is
  byte-identical to the template except for the inserted text -> guaranteed
  pixel/structure match, borders and photo box included.

Usage:
    python3 fill_rirekisho.py template.xlsx output.xlsx data.json
or import fill(data: dict) -> bytes and use programmatically / from a web
backend.
"""
import zipfile
import re
import sys
import json
import shutil
from xml.sax.saxutils import escape

SHEET_PATH = "xl/worksheets/sheet1.xml"  # 履歴書_フォーマット


def _cell_pattern(ref):
    # matches either a blank self-closing cell <c r="B5" s="32"/>
    # or a cell that already carries content <c r="B17" s="6" t="s"><v>2</v></c>
    return re.compile(
        r'<c r="%s"([^>]*?)(?:/>|>.*?</c>)' % re.escape(ref), re.DOTALL
    )


def _plain_is(text):
    """<is><t>...</t></is> block for a plain (non-rich) inline string."""
    text = text if text is not None else ""
    text = str(text).replace("\r\n", "\n")
    return "<is><t xml:space=\"preserve\">%s</t></is>" % escape(text)


def _choice_is(option_a, option_b, chosen, sep="\u3000\u30fb\u3000"):
    """
    Rebuilds a '男　・　女' / '有　・　無' style choice cell as rich text,
    bolding + underlining whichever side was chosen so the printed template
    text is preserved exactly and the selection is still unambiguous
    (digital equivalent of circling one option in pen).
    """
    def run(t, bold):
        if bold:
            return ('<r><rPr><b/><u/></rPr><t xml:space="preserve">%s</t></r>'
                    % escape(t))
        return '<r><t xml:space="preserve">%s</t></r>' % escape(t)

    a_bold = (chosen == "a")
    b_bold = (chosen == "b")
    return "<is>%s%s%s</is>" % (
        run(option_a, a_bold), run(sep, False), run(option_b, b_bold)
    )


def set_cell(xml_text, ref, is_block):
    pat = _cell_pattern(ref)
    if not pat.search(xml_text):
        raise ValueError(
            "Cell %s not found as a blank cell in %s "
            "(already has content, or wrong ref)" % (ref, SHEET_PATH)
        )
    m = pat.search(xml_text)
    attrs = m.group(1)
    # strip any pre-existing type attribute (e.g. t="s" for a shared-string
    # cell) since we're replacing the content with our own inline string
    attrs = re.sub(r'\s*t="[^"]*"', "", attrs)
    replacement = '<c r="%s"%s t="inlineStr">%s</c>' % (ref, attrs, is_block)
    return xml_text[: m.start()] + replacement + xml_text[m.end():]


# --- history / qualification table row anchors (top-left cell of each
#     2-row-tall merged entry), in the order they appear on the printed
#     page -------------------------------------------------------------
HISTORY_ROWS_PAGE1 = [f"A{r}" for r in range(30, 61, 2)]   # 16 rows, A col=year
HISTORY_ROWS_PAGE2 = [f"O{r}" for r in range(5, 21, 2)]    # 8 rows,  O col=year
QUALIFICATION_ROWS = [f"O{r}" for r in range(24, 37, 2)]   # 7 rows,  O col=year


def _history_cells(anchor):
    """Given the year-cell ref of a history/qualification row, return the
    (year, month, content) cell refs for that same row."""
    col = anchor[0]
    row = int(anchor[1:])
    if col == "A":
        return f"A{row}", f"B{row}", f"C{row}"
    else:  # 'O' column table (page 2, both history-cont. and qualifications)
        return f"O{row}", f"P{row}", f"Q{row}"


def fill(data: dict, template_path: str) -> bytes:
    """
    data keys (all optional -- omit what you don't have):
      furigana, name, nationality, gender ('男'/'女'),
      dob_text            e.g. "1998年4月1日生（満27歳）" -- full replacement
                           text for the G13 birth-date sentence
      addr_furigana, zip, address, phone, email
      contact_furigana, contact_zip, contact_address, contact_phone, contact_email
      history: [ {"year":"2016","month":"4","content":"〇〇大学 入学"}, ... ]
                up to 24 rows total (first 16 flow onto page 1, the rest
                onto page 2's continuation table)
      qualifications: [ {"year":"2019","month":"7","content":"日本語能力試験N2 合格"}, ... ]
                up to 7 rows
      self_pr_text        text for 特技・自己PRなど box
      commute_hours, commute_minutes
      dependents           integer/str, 扶養家族数
      spouse ('a'=有 / 'b'=無)
      spouse_duty ('a'=有 / 'b'=無)
      request_text          本人希望記入欄
    """
    with zipfile.ZipFile(template_path, "r") as zin:
        names = zin.namelist()
        sheet_xml = zin.read(SHEET_PATH).decode("utf-8")
        other_files = {n: zin.read(n) for n in names if n != SHEET_PATH}

    x = sheet_xml

    simple_map = {
        "B5": data.get("furigana"),
        "B7": data.get("name"),
        "B13": data.get("nationality"),
        "B15": data.get("addr_furigana"),
        "K16": data.get("phone"),
        "K19": data.get("email"),
        "B21": data.get("contact_furigana"),
        "K22": data.get("contact_phone"),
        "B25": data.get("contact_address"),
        "K25": data.get("contact_email"),
    }
    for ref, val in simple_map.items():
        if val:
            x = set_cell(x, ref, _plain_is(val))

    if data.get("zip"):
        x = set_cell(x, "B17", _plain_is("\u3012" + data["zip"]))
    if data.get("address"):
        x = set_cell(x, "B19", _plain_is(data["address"]))
    if data.get("contact_zip"):
        x = set_cell(x, "B23", _plain_is("\u3012" + data["contact_zip"]))

    if data.get("dob_text"):
        x = set_cell(x, "G13", _plain_is(data["dob_text"]))

    if data.get("gender"):
        chosen = "a" if data["gender"] == "\u7537" else "b"  # 男
        x = set_cell(x, "L13", _choice_is("\u7537", "\u5973", chosen))

    if "spouse" in data and data["spouse"] in ("a", "b"):
        x = set_cell(x, "X46", _choice_is("\u6709", "\u7121", data["spouse"]))
    if "spouse_duty" in data and data["spouse_duty"] in ("a", "b"):
        x = set_cell(x, "Z46", _choice_is("\u6709", "\u7121", data["spouse_duty"]))

    if data.get("commute_hours") or data.get("commute_minutes"):
        h = data.get("commute_hours", 0) or 0
        m = data.get("commute_minutes", 0) or 0
        x = set_cell(x, "X40", _plain_is(f"\u3000\u3000\u3000\u7d04\u3000{h}\u6642\u9593\u3000{m}\u5206"))

    if data.get("dependents") not in (None, ""):
        x = set_cell(x, "X43", _plain_is(f"\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000\u3000{data['dependents']}\u4eba"))

    if data.get("self_pr_text"):
        x = set_cell(x, "O40", _plain_is(data["self_pr_text"]))

    if data.get("request_text"):
        x = set_cell(x, "O51", _plain_is(data["request_text"]))

    history = data.get("history") or []
    all_hist_slots = HISTORY_ROWS_PAGE1 + HISTORY_ROWS_PAGE2
    if len(history) > len(all_hist_slots):
        raise ValueError(f"Max {len(all_hist_slots)} history rows supported by this template.")
    for row, anchor in zip(history, all_hist_slots):
        yref, mref, cref = _history_cells(anchor)
        if row.get("year"):
            x = set_cell(x, yref, _plain_is(row["year"]))
        if row.get("month"):
            x = set_cell(x, mref, _plain_is(row["month"]))
        if row.get("content"):
            x = set_cell(x, cref, _plain_is(row["content"]))

    quals = data.get("qualifications") or []
    if len(quals) > len(QUALIFICATION_ROWS):
        raise ValueError(f"Max {len(QUALIFICATION_ROWS)} qualification rows supported by this template.")
    for row, anchor in zip(quals, QUALIFICATION_ROWS):
        yref, mref, cref = _history_cells(anchor)
        if row.get("year"):
            x = set_cell(x, yref, _plain_is(row["year"]))
        if row.get("month"):
            x = set_cell(x, mref, _plain_is(row["month"]))
        if row.get("content"):
            x = set_cell(x, cref, _plain_is(row["content"]))

    # --- re-zip: every other part copied through completely unchanged,
    #     including xl/drawings/*.xml (the photo box) ---------------------
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, content in other_files.items():
            zout.writestr(name, content)
        zout.writestr(SHEET_PATH, x.encode("utf-8"))
    return buf.getvalue()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("usage: python3 fill_rirekisho.py template.xlsx output.xlsx data.json")
        sys.exit(1)
    template_path, output_path, data_path = sys.argv[1:4]
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)
    out_bytes = fill(data, template_path)
    with open(output_path, "wb") as f:
        f.write(out_bytes)
    print("wrote", output_path)
