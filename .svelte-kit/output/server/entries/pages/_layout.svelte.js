import "clsx";
import "../../chunks/db.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex items-center justify-center min-h-screen bg-ibm-gray"><div class="text-center"><div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div> <div class="text-ibm-text-muted text-sm">Wird geladen…</div></div></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
