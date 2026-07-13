import { a4 as attr_class, a5 as stringify, a6 as attr_style, e as escape_html, a3 as derived, a7 as ensure_array_like, a8 as attr } from "../../chunks/index.js";
import "clsx";
import "../../chunks/db.js";
const PRIO_BASE = { urgent: 80, high: 60, normal: 40, low: 20 };
function calcScore(task, allTasks) {
  if (task.status !== "open") return 0;
  let score = PRIO_BASE[task.priority] ?? 40;
  if (task.dueDate) {
    const daysLeft = daysDiff(/* @__PURE__ */ new Date(), new Date(task.dueDate));
    if (daysLeft < 0) score += 25;
    else if (daysLeft <= 3) score += 20;
    else if (daysLeft <= 7) score += 10;
    else if (daysLeft <= 14) score += 5;
  }
  const isBlockerFor = allTasks.filter(
    (t) => t.status === "open" && t.blockedBy.includes(task.id)
  );
  if (isBlockerFor.length > 0) {
    score += Math.min(15, isBlockerFor.length * 5);
  }
  const ageInWeeks = Math.floor(daysDiff(new Date(task.createdAt), /* @__PURE__ */ new Date()) / 7);
  score += Math.min(20, ageInWeeks);
  const isBlocked = task.blockedBy.some((id) => {
    const blocker = allTasks.find((t) => t.id === id);
    return blocker && blocker.status === "open";
  });
  if (isBlocked) score -= 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function rankTasks(tasks2) {
  const open = tasks2.filter((t) => t.status === "open");
  return tasks2.map((task) => ({ ...task, score: calcScore(task, open) })).sort((a, b) => b.score - a.score);
}
function getAreas(tasks2) {
  return [...new Set(tasks2.map((t) => t.area).filter(Boolean))].sort();
}
function daysDiff(from, to) {
  return Math.round((to.getTime() - from.getTime()) / (1e3 * 60 * 60 * 24));
}
let _tasks = [];
let _activeArea = "";
let _searchQuery = "";
const tasks = {
  get areas() {
    return getAreas(_tasks);
  },
  get activeArea() {
    return _activeArea;
  },
  set activeArea(v) {
    _activeArea = v;
  },
  get searchQuery() {
    return _searchQuery;
  },
  set searchQuery(v) {
    _searchQuery = v;
  },
  /** Gefilterte Tasks (nach Area + Suchbegriff) */
  get filtered() {
    let result = _tasks.filter((t) => t.status === "open");
    if (_activeArea) result = result.filter((t) => t.area === _activeArea);
    if (_searchQuery.trim()) {
      const q = _searchQuery.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.area.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)));
    }
    return rankTasks(result);
  },
  /** Anzahl offener Tasks pro Area */
  get countByArea() {
    const counts = {};
    for (const t of _tasks.filter((t2) => t2.status === "open")) {
      counts[t.area || "(kein Bereich)"] = (counts[t.area || "(kein Bereich)"] ?? 0) + 1;
    }
    return counts;
  }
};
function TaskCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { task } = $$props;
    const PRIORITY_COLORS = {
      urgent: "bg-red-100 text-red-800 border-red-200",
      high: "bg-orange-100 text-orange-800 border-orange-200",
      normal: "bg-blue-50 text-blue-800 border-blue-200",
      low: "bg-gray-100 text-gray-600 border-gray-200"
    };
    const PRIORITY_LABELS = {
      urgent: "Kritisch",
      high: "Hoch",
      normal: "Normal",
      low: "Niedrig"
    };
    function scoreColor(score) {
      if (score >= 75) return "bg-red-500";
      if (score >= 50) return "bg-orange-400";
      if (score >= 30) return "bg-blue-400";
      return "bg-gray-300";
    }
    function deadlineText(dueDate) {
      if (!dueDate) return null;
      const days = Math.round((new Date(dueDate) - /* @__PURE__ */ new Date()) / 864e5);
      if (days < 0) return `${Math.abs(days)} Tage überfällig`;
      if (days === 0) return "Heute fällig";
      if (days === 1) return "Morgen fällig";
      return `In ${days} Tagen fällig`;
    }
    const deadline = derived(() => deadlineText(task.dueDate));
    const isOverdue = derived(() => task.dueDate && new Date(task.dueDate) < /* @__PURE__ */ new Date());
    $$renderer2.push(`<div class="bg-white border border-ibm-gray-dark rounded-md overflow-hidden hover:shadow-sm transition-shadow"><div${attr_class(`h-1 ${stringify(scoreColor(task.score))}`)}${attr_style(`width: ${stringify(task.score)}%`)}></div> <div class="p-3"><div class="flex items-start gap-3"><button class="mt-0.5 w-5 h-5 rounded border-2 border-ibm-gray-dark flex-shrink-0 hover:border-ibm-blue hover:bg-ibm-gray transition-colors" title="Als erledigt markieren" aria-label="Erledigt"></button> <div class="flex-1 min-w-0"><button class="text-left w-full"><span class="text-sm font-medium text-ibm-text leading-snug block">${escape_html(task.title || "(kein Titel)")}</span></button> <div class="flex flex-wrap items-center gap-1.5 mt-1.5">`);
    if (task.area) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="text-xs bg-ibm-gray text-ibm-text-muted px-2 py-0.5 rounded">${escape_html(task.area)}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <span${attr_class(`text-xs border px-2 py-0.5 rounded ${stringify(PRIORITY_COLORS[task.priority])}`)}>${escape_html(PRIORITY_LABELS[task.priority])}</span> `);
    if (task.customer) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="text-xs text-ibm-text-muted">Kunde: ${escape_html(task.customer)}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (deadline()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span${attr_class(`text-xs ${isOverdue() ? "text-red-600 font-semibold" : "text-orange-600"}`)}>⏰ ${escape_html(deadline())}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <span class="text-xs text-ibm-text-muted ml-auto">Score: ${escape_html(task.score)}</span></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <button class="text-ibm-gray-dark hover:text-red-500 transition-colors flex-shrink-0 p-1" title="Task löschen" aria-label="Löschen">✕</button></div></div></div>`);
  });
}
function AreaFilter($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"><button${attr_class(`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!tasks.activeArea ? "bg-ibm-blue text-white border-ibm-blue" : "bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue"}`)}>Alle <span class="ml-1 opacity-70">${escape_html(Object.values(tasks.countByArea).reduce((a, b) => a + b, 0))}</span></button> <!--[-->`);
    const each_array = ensure_array_like(tasks.areas);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let area = each_array[$$index];
      const count = tasks.countByArea[area] ?? 0;
      if (count > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button${attr_class(`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${tasks.activeArea === area ? "bg-ibm-blue text-white border-ibm-blue" : "bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue"}`)}>${escape_html(area)} <span class="ml-1 opacity-70">${escape_html(count)}</span></button>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="max-w-2xl mx-auto px-4 py-4">`);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex gap-2 mb-4"><button class="flex-1 bg-ibm-blue text-white text-sm font-semibold py-2 px-3 rounded-md hover:bg-ibm-blue-dark transition-colors">${escape_html("⭐ Focus-Modus")}</button> <button class="bg-white border border-ibm-gray-dark text-ibm-text text-sm font-semibold py-2 px-4 rounded-md hover:bg-ibm-gray transition-colors">+ Neu</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="mb-4 space-y-2"><input type="search" placeholder="Tasks durchsuchen…"${attr("value", tasks.searchQuery)} class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"/> `);
      AreaFilter($$renderer2);
      $$renderer2.push(`<!----></div> <div class="text-xs text-ibm-text-muted mb-3">${escape_html(tasks.filtered.length)} offene Tasks `);
      if (tasks.activeArea) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`in <strong>${escape_html(tasks.activeArea)}</strong>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (tasks.filtered.length === 0) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<div class="text-center text-ibm-text-muted py-12 text-sm">Keine offenen Tasks ${escape_html(tasks.activeArea ? `in "${tasks.activeArea}"` : "")}.</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<ul class="space-y-2"><!--[-->`);
        const each_array = ensure_array_like(tasks.filtered);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let task = each_array[$$index];
          $$renderer2.push(`<li>`);
          TaskCard($$renderer2, {
            task
          });
          $$renderer2.push(`<!----></li>`);
        }
        $$renderer2.push(`<!--]--></ul>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
