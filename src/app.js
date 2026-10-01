import { createRepository, fetchLoader } from "./data/repository.js";
import { setupEvidencePanel } from "./ui/evidence.js";
import { h, empty } from "./ui/dom.js";
import * as commitmentsView from "./views/commitments.js";
import * as trackingView from "./views/tracking.js";
import * as outcomesView from "./views/outcomes.js";

const ROUTES = {
  commitments: commitmentsView,
  tracking: trackingView,
  outcomes: outcomesView,
};
const DEFAULT_ROUTE = "commitments";

const repo = createRepository(fetchLoader("data/"));
const main = document.getElementById("view");

// Route state lives in the hash: #/<route>?key=value
function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const route = ROUTES[path] ? path : DEFAULT_ROUTE;
  return { route, params: Object.fromEntries(new URLSearchParams(query)) };
}

function hashFor(route, params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return `#/${route}${q.toString() ? "?" + q : ""}`;
}

// Views call this when filters change. It updates the URL without a
// re-mount so inputs keep focus.
function setParams(route, params) {
  history.replaceState(null, "", hashFor(route, params));
}

let mounted = 0;
async function render() {
  const { route, params } = parseHash();
  const token = ++mounted;
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const view = ROUTES[route];
  document.title = `${view.title} · ביקורת בחירות כנסת 26`;
  const root = h("div", { class: "view view-" + route });
  main.replaceChildren(root);
  try {
    await view.mount(root, {
      repo,
      params,
      setParams: (p) => setParams(route, p),
      isCurrent: () => token === mounted,
    });
  } catch (e) {
    console.error(e);
    root.replaceChildren(empty("טעינת הנתונים נכשלה: " + e.message));
  }
}

async function renderMeta() {
  const meta = await repo.getMeta();
  document.querySelectorAll("[data-meta]").forEach((n) => {
    const v = meta[n.dataset.meta];
    if (v != null) n.textContent = v;
  });
}

setupEvidencePanel(repo);
window.addEventListener("hashchange", () => { render(); window.scrollTo({ top: 0 }); });
render();
renderMeta();
