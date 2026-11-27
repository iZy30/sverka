from pathlib import Path
import sys

from openpyxl import load_workbook

out = Path(sys.argv[1])
group = load_workbook(out / "group-report.xlsx")
sheet = group["Ведомость"]
assert [sheet.cell(row, 2).value for row in range(2, 5)] == ["112", "113", "114"]
assert sheet["D2"].value == "Да" and sheet["D3"].value == "Нет"
assert sheet["A2"].fill.fgColor.rgb == "FFE1F1D8"
assert sheet.auto_filter.ref.endswith("4")
assert group["Вне базы"]["A2"].value == "XXX-00001"

manual = load_workbook(out / "manual-report.xlsx")["Ведомость"]
assert [manual.cell(row, 2).value for row in (2, 3)] == ["000042", "QA-OFFICE-2"]
assert [manual.cell(row, 3).value for row in (2, 3)] == ["Да", "Да"]
custom = load_workbook(out / "custom-report.xlsx")["Ведомость"]
assert "000042" in [cell.value for row in custom for cell in row]
legacy = load_workbook(out / "legacy-report.xlsx")["Ведомость"]
assert legacy["A2"].value == "__QA_LEGACY__"
assert "сохранить" in [cell.value for cell in legacy[2]]
print("Independent XLSX checks passed for imported, manual, and retained ledgers.")
