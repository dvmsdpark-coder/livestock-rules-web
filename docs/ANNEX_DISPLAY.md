# 별표 본문 표시와 갱신

법령 별표는 문장은 텍스트로, 독립된 표는 행·열·병합 셀을 유지한 HTML 표로 표시합니다. 도안과 치수, 쪽 경계에 걸친 표, 문자 또는 셀 구조의 완전성을 확인할 수 없는 표는 원문 이미지를 유지합니다. 일반기준과 표가 혼재된 별표는 일반기준 문장을 먼저 읽을 수 있습니다. 원문 이미지 대조 기능도 유지합니다.

`tools/build_annex_layouts.py`는 원문 PDF의 SHA-256을 확인하고 실제 별표의 모든 쪽을 검사합니다. 표를 텍스트로 옮길 때 각 문자의 수와 셀의 겹침·누락을 검사하며, 불일치 시 이미지로 보존합니다. 추출 자료는 `site/data/annex-layouts.json`에 생성되고 해당 PDF 해시와 일치할 때만 사용됩니다. 별지는 서식 배치를 유지합니다.

GitHub Pages 배포 과정에서 변환과 `tests/annex_layouts_test.py` 검사가 실행되므로 새 PDF 반영 시에도 같은 처리가 적용됩니다. 별도의 수동 별표 번호 목록으로 글 중심 별표를 지정할 필요가 없습니다. 치수·도안의 기존 검토 기록은 원문 해시에 한정되며 새 PDF로 무조건 이전되지 않습니다.

로컬 확인:

```powershell
node tools/list-annex-layouts.mjs
python tools/build_annex_layouts.py
python tests/annex_layouts_test.py
```

이 검사는 문자·셀 보존과 표시 분류를 확인하며 법령의 내용 또는 효력을 판단하지 않습니다. 표의 복잡한 구조가 불확실한 부분은 원문 확인이 필요합니다.
