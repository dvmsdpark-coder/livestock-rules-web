import sys,unittest
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from pdf_geometry import render_box,pixel_box
import pdfplumber

class PdfGeometry(unittest.TestCase):
    def test_cropbox_offset_and_visible_scale_are_both_applied(self):
        page=SimpleNamespace(bbox=(0,0,600,840),cropbox=(20,40,580,800))
        self.assertEqual(render_box(page),[20,40,580,800])
        self.assertEqual(pixel_box([100,500,500,650],render_box(page),1120,1520),[160,920,960,1220])
        self.assertEqual(pixel_box([0,0,100,100],render_box(page),1120,1520),[0,0,160,120])
    def test_full_media_box_and_outside_region(self):
        page=SimpleNamespace(bbox=(0,0,600,840),cropbox=None)
        self.assertEqual(pixel_box([100,100,400,300],render_box(page),1200,1680),[200,200,800,600])
        with self.assertRaises(ValueError):pixel_box([0,0,5,5],[20,40,580,800],1120,1520)
    def test_fmd_cropbox_and_caption_source_boundaries(self):
        with pdfplumber.open(ROOT/'site/pdf/de2a0c26-cb9d-4f83-b3f9-4d31f29fbbef.pdf') as pdf:
            p=pdf.pages[8];visible=render_box(p);self.assertGreater(visible[0],0);self.assertGreater(visible[1],0)
            region=[90,551,506,676];pixels=pixel_box(region,visible,1440,1955)
            self.assertGreater(pixels[1],1300);self.assertGreater(pixels[3],1630)
            before=[c for c in p.chars if 525<c['top']<540];caption=[c for c in p.chars if 660<c['top']<670]
            self.assertLess(max(c['bottom'] for c in before),region[1]);self.assertGreater(region[3],max(c['bottom'] for c in caption));self.assertLess(region[0],min(c['x0'] for c in caption));self.assertGreater(region[2],max(c['x1'] for c in caption))

if __name__=='__main__':unittest.main()
