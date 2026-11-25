"""Regression checks against full dashboard redraw and duplicate listeners."""
from pathlib import Path
import unittest

JS = (Path(__file__).resolve().parents[1] /
      "custom_components/ai_energy_manager/frontend/ai-energy-panel.js")

class SmoothDashboardContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.code=JS.read_text(encoding="utf-8")

    def test_full_shadow_dom_not_replaced_during_render(self):
        self.assertNotIn("this.shadowRoot.innerHTML =",self.code)
        self.assertIn("this.patchDom(nextHtml)",self.code)
        self.assertIn('if(oldNode.nodeValue!==newNode.nodeValue)',self.code)

    def test_controls_have_one_listener_per_element(self):
        self.assertIn("listenOnce(el,key,event,handler)",self.code)
        self.assertIn('this.listenOnce(q("#editor-save")',self.code)
        self.assertIn('this.listenOnce(this.shadowRoot.querySelector("#energy-mode")',self.code)

    def test_scroll_is_preserved(self):
        self.assertIn('rail.scrollLeft=previous.planX',self.code)
        self.assertIn('contentEl.scrollTop=previous.contentY',self.code)

    def test_live_render_is_throttled(self):
        self.assertIn('750-(Date.now()-this._lastLiveRenderAt)',self.code)

if __name__=="__main__":
    unittest.main()
