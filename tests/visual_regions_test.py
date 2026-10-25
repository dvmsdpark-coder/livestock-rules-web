import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from sop_visuals import with_caption,prose_raster

class VisualRegions(unittest.TestCase):
    def test_caption_note_and_wrapped_note_are_preserved_but_next_section_is_not(self):
        rows=[((95,75,405,93),'그림 1. 방역 절차'),((100,305,400,315),'주: 적용 조건을 함께 확인한다.'),((100,319,400,331),'예외 조건은 다음과 같다.'),((100,350,400,365),'2. 다음 절차')]
        crop=with_caption((100,100,400,300),rows,595,842)
        self.assertLessEqual(crop[1],75);self.assertGreaterEqual(crop[3],331);self.assertLess(crop[3],350)
    def test_plain_paragraph_is_not_attached_as_a_picture_note(self):
        crop=with_caption((100,100,400,300),[((100,310,400,325),'다음의 별도 조치는 본문에서 규정한다.')],595,842)
        self.assertEqual(crop[3],309)
    def test_native_prose_boxes_do_not_become_figures_but_short_diagram_labels_do(self):
        rows=[((100,110+i*20,400,125+i*20),'이 문장은 그림이 아니라 본문의 설명을 담은 문장입니다. 필요한 적용 조건을 확인합니다.') for i in range(5)]
        self.assertTrue(prose_raster((90,100,410,230),rows))
        labels=[(b,'기관 '+str(i)) for i,(b,_) in enumerate(rows)]
        self.assertFalse(prose_raster((90,100,410,230),labels))
if __name__=='__main__':unittest.main()
